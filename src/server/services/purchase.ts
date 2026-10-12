import { Prisma, type OrderItemKind } from "@prisma/client";
import { prisma } from "@/server/db";
import { newOrderCode, newRunId } from "@/lib/ids";
import { publicCheckoutSchema } from "@/server/validation/schemas";
import { flattenErrors, type FieldErrors } from "@/server/validation/common";
import { advanceToInteractive, decide, nextKey, type Decision } from "@/lib/funnels/simulate";
import { OFFER_STEP_TYPES, type GraphNode } from "@/lib/funnels/types";
import { getActivePaymentProvider } from "@/server/payments/registry";
import { startRealPayment } from "./payment-flow";
import { consumeCouponUse, evaluateCouponCode } from "./coupons";
import { getPublicCheckout } from "./checkouts";
import { toGraph } from "./funnels";
import { computeOrderTotals } from "./order-logic";
import { upsertCustomer } from "./orders";
import { EVENT_TYPES, trackEvent } from "./analytics";

export type PurchaseOutcome =
  | { kind: "invalid"; fieldErrors: FieldErrors }
  | { kind: "coupon_error"; message: string }
  | { kind: "unavailable" }
  | { kind: "payments_unavailable"; message: string }
  | { kind: "demo_approved"; orderCode: string; runId: string | null }
  | { kind: "payment_started"; token: string; redirectUrl: string | null }
  | { kind: "payment_not_started"; message: string };

export const PAYMENTS_UNAVAILABLE_MESSAGE =
  "O processamento de pagamentos ainda não está configurado. Nenhum valor foi cobrado e nenhum dado de pagamento foi recolhido.";

export async function startCheckoutSession(publicId: string, utm: { source?: string; medium?: string; campaign?: string }) {
  const res = await getPublicCheckout(publicId);
  if (res.state !== "ok") return null;
  const c = res.checkout;
  const session = await prisma.checkoutSession.create({
    data: {
      checkoutId: c.id,
      isDemo: c.isDemo,
      utmSource: utm.source?.slice(0, 100),
      utmMedium: utm.medium?.slice(0, 100),
      utmCampaign: utm.campaign?.slice(0, 100),
    },
  });
  await trackEvent({ type: EVENT_TYPES.CHECKOUT_VIEW, isDemo: c.isDemo, checkoutId: c.id, sessionId: session.id });
  return session.id;
}

export async function previewCoupon(publicId: string, code: string) {
  const res = await getPublicCheckout(publicId);
  if (res.state !== "ok") return { ok: false as const, message: "Checkout indisponível." };
  const c = res.checkout;
  if (!c.allowCoupons) return { ok: false as const, message: "Este checkout não aceita cupões." };
  const { evaluation } = await evaluateCouponCode(code, {
    isDemo: c.isDemo,
    productId: c.productId,
    currency: c.offer.currency,
    subtotalCents: c.offer.priceCents,
  });
  await trackEvent({
    type: evaluation.ok ? EVENT_TYPES.COUPON_APPLIED : EVENT_TYPES.COUPON_REJECTED,
    isDemo: c.isDemo,
    checkoutId: c.id,
    meta: { code: code.slice(0, 32).toUpperCase() },
  });
  if (!evaluation.ok) return { ok: false as const, message: evaluation.message };
  return { ok: true as const, discountCents: evaluation.discountCents, totalCents: evaluation.totalCents, code: code.trim().toUpperCase() };
}

export async function submitCheckout(publicId: string, raw: Record<string, unknown>, sessionId?: string): Promise<PurchaseOutcome> {
  const res = await getPublicCheckout(publicId);
  if (res.state !== "ok") return { kind: "unavailable" };
  const c = res.checkout;

  const parsed = publicCheckoutSchema({ requirePhone: c.requirePhone, requireDocument: c.requireDocument }).safeParse(raw);
  if (!parsed.success) return { kind: "invalid", fieldErrors: flattenErrors(parsed.error) };
  const input = parsed.data;

  const session = sessionId
    ? await prisma.checkoutSession.findFirst({ where: { id: sessionId, checkoutId: c.id } })
    : null;
  await trackEvent({ type: EVENT_TYPES.CHECKOUT_SUBMIT, isDemo: c.isDemo, checkoutId: c.id, sessionId: session?.id });
  if (session) await prisma.checkoutSession.update({ where: { id: session.id }, data: { status: "SUBMITTED" } });

  let couponId: string | null = null;
  let discountCents = 0;
  if (input.coupon) {
    if (!c.allowCoupons) return { kind: "coupon_error", message: "Este checkout não aceita cupões." };
    const { evaluation, coupon } = await evaluateCouponCode(input.coupon, {
      isDemo: c.isDemo,
      productId: c.productId,
      currency: c.offer.currency,
      subtotalCents: c.offer.priceCents,
    });
    if (!evaluation.ok) return { kind: "coupon_error", message: evaluation.message };
    couponId = coupon!.id;
    discountCents = evaluation.discountCents;
  }

  if (!c.isDemo) {
    // Modo real: sem processador configurado, não se cria cobrança nem se aprova nada.
    const provider = getActivePaymentProvider();
    if (!provider) {
      await trackEvent({ type: EVENT_TYPES.CHECKOUT_PAYMENT_UNAVAILABLE, isDemo: false, checkoutId: c.id, sessionId: session?.id });
      return { kind: "payments_unavailable", message: PAYMENTS_UNAVAILABLE_MESSAGE };
    }
    // Encomenda PENDING + cobrança no fornecedor. A aprovação só acontece por confirmação oficial.
    const r = await startRealPayment(
      c,
      { name: input.name, email: input.email, phone: input.phone, document: input.document, method: input.method, idempotencyKey: input.idempotencyKey },
      { couponId, discountCents },
      session?.id ?? null,
    );
    if (r.kind === "payments_unavailable") {
      await trackEvent({ type: EVENT_TYPES.CHECKOUT_PAYMENT_UNAVAILABLE, isDemo: false, checkoutId: c.id, sessionId: session?.id });
    }
    return r;
  }

  // Modo de demonstração: compra simulada, claramente identificada, sem cobrança.
  const totals = computeOrderTotals([{ unitPriceCents: c.offer.priceCents, quantity: 1 }], discountCents);
  const funnel =
    c.funnelId
      ? await prisma.funnel.findFirst({ where: { id: c.funnelId, status: "ACTIVE", isDemo: true }, include: { steps: true, edges: true } })
      : null;

  const result = await prisma.$transaction(async (tx) => {
    if (couponId && !(await consumeCouponUse(tx, couponId))) return null;
    const customer = await upsertCustomer(tx, { email: input.email, name: input.name, phone: input.phone, document: input.document }, true);
    const order = await tx.order.create({
      data: {
        code: newOrderCode(),
        customerId: customer.id,
        checkoutId: c.id,
        funnelId: funnel?.id ?? null,
        couponId,
        status: "APPROVED",
        source: "DEMO",
        currency: c.offer.currency,
        ...totals,
        notes: "Compra simulada em modo de demonstração — nenhum valor foi cobrado.",
        isDemo: true,
        approvedAt: new Date(),
        items: {
          create: {
            productId: c.productId,
            offerId: c.offerId,
            kind: "MAIN",
            description: `${c.product.name} — ${c.offer.name}`,
            unitPriceCents: c.offer.priceCents,
            quantity: 1,
            totalCents: c.offer.priceCents,
          },
        },
      },
    });
    if (session) await tx.checkoutSession.update({ where: { id: session.id }, data: { status: "CONVERTED" } });

    let runId: string | null = null;
    if (funnel) {
      const graph = toGraph(funnel);
      const entry = graph.nodes.find((n) => n.type === "CHECKOUT" && n.config.checkoutId === c.id) ?? graph.nodes.find((n) => n.type === "CHECKOUT");
      const after = entry ? nextKey(graph, entry.key, "next") : null;
      const next = after ? advanceToInteractive(graph, after) : null;
      if (next) {
        runId = newRunId();
        await tx.funnelRun.create({
          data: { id: runId, funnelId: funnel.id, orderId: order.id, currentStepKey: next.key, isDemo: true, history: [] },
        });
      }
    }
    return { orderCode: order.code, runId };
  });
  if (!result) return { kind: "coupon_error", message: "Este cupão atingiu o limite de utilizações." };
  return { kind: "demo_approved", ...result };
}

// ───────────── Percurso no funil (upsell/downsell) ─────────────

export async function getRunView(runId: string) {
  if (!/^[A-Za-z0-9]{10,40}$/.test(runId)) return null;
  const run = await prisma.funnelRun.findUnique({
    where: { id: runId },
    include: {
      funnel: { include: { steps: true, edges: true } },
      order: { include: { items: true, checkout: { select: { primaryColor: true, backgroundColor: true, successTitle: true, successMessage: true, supportEmail: true } } } },
    },
  });
  if (!run || !run.order) return null;
  const graph = toGraph(run.funnel);
  const node = graph.nodes.find((n) => n.key === run.currentStepKey) ?? null;
  let offer = null;
  if (node && OFFER_STEP_TYPES.includes(node.type) && node.config.offerId) {
    offer = await prisma.offer.findFirst({
      where: { id: node.config.offerId, productId: node.config.productId, product: { isDemo: run.isDemo } },
      include: { product: true },
    });
  }
  return { run, node, offer, order: run.order };
}

const KIND_BY_STEP: Partial<Record<GraphNode["type"], OrderItemKind>> = { UPSELL: "UPSELL", DOWNSELL: "DOWNSELL", ORDER_BUMP: "ORDER_BUMP" };

export async function decideRun(runId: string, stepKey: string, decision: Decision): Promise<{ ok: true } | { ok: false; message: string }> {
  const view = await getRunView(runId);
  if (!view || !view.node) return { ok: false, message: "Percurso inexistente." };
  const { run, node, offer, order } = view;
  if (!run.isDemo) return { ok: false, message: PAYMENTS_UNAVAILABLE_MESSAGE };
  // idempotência: decisões repetidas ou fora de ordem são ignoradas
  if (run.completedAt || run.currentStepKey !== stepKey || !OFFER_STEP_TYPES.includes(node.type)) return { ok: true };

  const graph = toGraph(run.funnel);
  const next = decide(graph, node.key, decision);
  const history = [...((run.history as Prisma.JsonArray) ?? []), { key: node.key, type: node.type, decision, at: new Date().toISOString() }];

  if (decision === "accept") {
    if (!offer) return { ok: false, message: "Oferta indisponível." };
    if (offer.currency !== order.currency) return { ok: false, message: "A oferta tem uma moeda diferente do pedido." };
  }

  await prisma.$transaction(async (tx) => {
    const moved = await tx.funnelRun.updateMany({
      where: { id: run.id, currentStepKey: stepKey, completedAt: null },
      data: {
        currentStepKey: next?.key ?? stepKey,
        completedAt: next && OFFER_STEP_TYPES.includes(next.type) ? null : new Date(),
        history,
      },
    });
    if (moved.count !== 1) return;
    if (decision === "accept" && offer) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: offer.productId,
          offerId: offer.id,
          kind: KIND_BY_STEP[node.type] ?? "UPSELL",
          description: `${offer.product.name} — ${offer.name}`,
          unitPriceCents: offer.priceCents,
          quantity: 1,
          totalCents: offer.priceCents,
        },
      });
      await tx.order.update({
        where: { id: order.id },
        data: {
          subtotalCents: { increment: offer.priceCents },
          totalCents: { increment: offer.priceCents },
          netCents: { increment: offer.priceCents },
        },
      });
    }
  });
  await trackEvent({
    type: decision === "accept" ? EVENT_TYPES.OFFER_ACCEPT : EVENT_TYPES.OFFER_DECLINE,
    isDemo: true,
    funnelId: run.funnelId,
    orderId: order.id,
    stepKey: node.key,
    meta: { stepType: node.type },
  });
  return { ok: true };
}

export async function trackRunView(runId: string, stepKey: string, funnelId: string, isDemo: boolean) {
  await trackEvent({ type: EVENT_TYPES.FUNNEL_STEP_VIEW, isDemo, funnelId, stepKey, meta: { runId } });
}
