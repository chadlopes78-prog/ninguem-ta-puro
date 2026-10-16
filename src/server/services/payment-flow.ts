// Fluxo de pagamento real: encomenda pendente idempotente → cobrança no fornecedor → confirmação → entrega.
// O preço vem SEMPRE da base de dados; o browser só envia identificação, método e telefone.
import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { accessTarget } from "./delivery";
import { supportLink } from "@/lib/product-setup";
import { newOrderCode } from "@/lib/ids";
import { getActivePaymentProviders, getProvider } from "@/server/payments/registry";
import { resolveAppBaseUrl } from "@/server/app-url";
import { applyPaymentStatus, audit } from "@/server/payments/confirm";
import { recordOrderEventSafe } from "@/server/notifications/events";
import type { PaymentMethodOption, PaymentProvider } from "@/server/payments/types";
import { consumeCouponUse } from "./coupons";
import { computeOrderTotals } from "./order-logic";
import { upsertCustomer } from "./orders";
import { EVENT_TYPES, trackEvent } from "./analytics";
import type { getPublicCheckout } from "./checkouts";
import { scopeOf } from "@/server/scope";

type PublicCheckout = Extract<Awaited<ReturnType<typeof getPublicCheckout>>, { state: "ok" }>["checkout"];

export const PAYMENT_ERROR_MESSAGE = "Não foi possível iniciar o pagamento. Nenhum valor foi cobrado. Tente novamente dentro de instantes.";

/** Número móvel moçambicano: 8X XXX XXXX (com ou sem +258). Devolve 9 dígitos ou null. */
export function normalizeMzPhone(input: string | undefined | null): string | null {
  if (!input) return null;
  const digits = input.replace(/[\s().-]/g, "").replace(/^\+?258/, "");
  return /^8[2-7]\d{7}$/.test(digits) ? digits : null;
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 2)}•••••${phone.slice(-2)}`;
}



const token = () => randomBytes(18).toString("base64url");

/** Opção de pagamento apresentada no checkout. O id identifica o gateway: "epay" (página alojada) ou "e2payments:mpesa". */
export interface PaymentOptionView {
  id: string;
  providerId: string;
  providerName: string;
  label: string;
  requiresPhone: boolean;
  hosted: { methodsLabel: string; isTest: boolean } | null;
}

export function listPaymentOptions(providers: PaymentProvider[]): PaymentOptionView[] {
  return providers.flatMap((p): PaymentOptionView[] =>
    p.checkoutMode === "hosted"
      ? [{ id: p.id, providerId: p.id, providerName: p.displayName, label: p.displayName, requiresPhone: false, hosted: { methodsLabel: p.hostedMethodsLabel ?? "carteira móvel", isTest: p.environment() === "test" } }]
      : p.methods().map((m) => ({ id: `${p.id}:${m.id}`, providerId: p.id, providerName: p.displayName, label: m.label, requiresPhone: m.requiresPhone, hosted: null })),
  );
}

/** Traduz a opção escolhida no browser para um gateway ativo. Nunca aceita um gateway inativo ou desconhecido. */
export function resolvePaymentOption(providers: PaymentProvider[], optionId: string | undefined): { provider: PaymentProvider; method: PaymentMethodOption | null } | null {
  const id = (optionId ?? "").trim();
  if (id) {
    const [pid, mid] = id.includes(":") ? id.split(":", 2) : [id, ""];
    const byId = providers.find((p) => p.id === pid);
    if (byId) {
      if (byId.checkoutMode === "hosted") return mid ? null : { provider: byId, method: null };
      const m = byId.methods().find((x) => x.id === mid);
      return m ? { provider: byId, method: m } : null;
    }
    // compatibilidade: id simples de método quando só existe um gateway direto (ex.: "mpesa")
    if (!id.includes(":")) {
      const direct = providers.filter((p) => p.checkoutMode === "direct");
      if (direct.length === 1) {
        const m = direct[0].methods().find((x) => x.id === id);
        if (m) return { provider: direct[0], method: m };
      }
    }
    return null;
  }
  // sem escolha: só é aceite quando existe uma única opção alojada (ex.: apenas EPay ativa)
  return providers.length === 1 && providers[0].checkoutMode === "hosted" ? { provider: providers[0], method: null } : null;
}

export type StartPaymentOutcome =
  | { kind: "payments_unavailable"; message: string }
  | { kind: "invalid"; fieldErrors: Record<string, string> }
  | { kind: "coupon_error"; message: string }
  | { kind: "payment_started"; token: string; redirectUrl: string | null }
  | { kind: "payment_not_started"; message: string };

export async function startRealPayment(
  c: PublicCheckout,
  input: { name: string; email: string; phone?: string; document?: string; method?: string; idempotencyKey?: string },
  coupon: { couponId: string | null; discountCents: number },
  sessionId: string | null,
): Promise<StartPaymentOutcome> {
  // Só os gateways (e credenciais) da conta dona do checkout
  const active = await getActivePaymentProviders(c.ownerId);
  if (active.length === 0) return { kind: "payments_unavailable", message: "Não existem métodos de pagamento disponíveis neste momento. Nenhum valor foi cobrado e nenhum dado de pagamento foi recolhido." };
  const supported = active.filter((p) => p.supportedCurrencies.includes(c.offer.currency));
  if (supported.length === 0) {
    return { kind: "payments_unavailable", message: "Este produto não pode ser pago online: a moeda não é suportada (apenas MZN)." };
  }

  // Cada pagamento vai exclusivamente para o gateway da opção escolhida (validada contra os gateways ativos).
  const selected = resolvePaymentOption(supported, input.method);
  if (!selected) return { kind: "invalid", fieldErrors: { method: "Escolha um método de pagamento" } };
  const { provider, method } = selected;
  const phone = method?.requiresPhone ? normalizeMzPhone(input.phone) : null;
  if (method?.requiresPhone && !phone) return { kind: "invalid", fieldErrors: { phone: "Introduza um número móvel moçambicano válido (ex.: 84 123 4567)" } };
  if (phone && method?.phonePrefixes?.length && !method.phonePrefixes.some((pre) => phone.startsWith(pre))) {
    return { kind: "invalid", fieldErrors: { phone: `O número ${method.label} deve começar por ${method.phonePrefixes.join(" ou ")}.` } };
  }

  const idem = input.idempotencyKey && /^[A-Za-z0-9_-]{16,64}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
  if (!idem) return { kind: "invalid", fieldErrors: { _form: "Pedido inválido. Atualize a página e tente novamente." } };

  // Submissão repetida (duplo clique, reenvio): devolve a mesma encomenda, sem nova cobrança
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: idem }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  if (existing) return { kind: "payment_started", token: existing.publicToken!, redirectUrl: existing.status === "PENDING" ? (existing.payments[0]?.redirectUrl ?? null) : null };
  const environment = provider.environment();

  const totals = computeOrderTotals([{ unitPriceCents: c.offer.priceCents, quantity: 1 }], coupon.discountCents);
  if (totals.totalCents <= 0) return { kind: "invalid", fieldErrors: { _form: "O total da encomenda tem de ser superior a zero." } };

  let created: { orderId: string; orderCode: string; publicToken: string; paymentId: string; reference: string; ownerId: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      if (coupon.couponId && !(await consumeCouponUse(tx, coupon.couponId))) throw new CouponExhausted();
      const customer = await upsertCustomer(tx, { email: input.email, name: input.name, phone: phone ?? input.phone, document: input.document }, scopeOf(c.ownerId, false));
      const publicToken = token();
      const order = await tx.order.create({
        data: {
          code: newOrderCode(),
          customerId: customer.id,
          checkoutId: c.id,
          // Funil ativo deste checkout: define o percurso após o pagamento confirmado
          funnelId: c.funnel?.status === "ACTIVE" ? c.funnel.id : null,
          couponId: coupon.couponId,
          status: "PENDING",
          source: "CHECKOUT",
          currency: c.offer.currency,
          ...totals,
          provider: provider.id,
          paymentMethod: method?.id ?? null,
          publicToken,
          idempotencyKey: idem,
          // a venda pertence à conta dona do checkout
          ownerId: c.ownerId,
          isDemo: false,
          // pagamentos com credenciais de teste nunca contam como receita
          isTestPayment: environment === "test",
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
      const reference = `${order.code}-${token().slice(0, 8)}`;
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          provider: provider.id,
          method: method?.id ?? null,
          environment,
          phoneMasked: phone ? maskPhone(phone) : null,
          amountCents: totals.totalCents,
          currency: c.offer.currency,
          status: "CREATED",
          idempotencyKey: reference,
        },
      });
      await audit(tx, order.id, null, "PENDING", "checkout", "Encomenda criada; pagamento iniciado");
      if (sessionId) await tx.checkoutSession.updateMany({ where: { id: sessionId, checkoutId: c.id }, data: { status: "SUBMITTED" } });
      return { orderId: order.id, orderCode: order.code, publicToken, paymentId: payment.id, reference, ownerId: c.ownerId };
    });
  } catch (e) {
    if (e instanceof CouponExhausted) return { kind: "coupon_error", message: "Este cupão atingiu o limite de utilizações." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.order.findUnique({ where: { idempotencyKey: idem } });
      if (again?.publicToken) return { kind: "payment_started", token: again.publicToken, redirectUrl: null };
    }
    throw e;
  }

  const charge = await chargeWithProvider(provider, created, {
    amountCents: totals.totalCents,
    currency: c.offer.currency,
    method: method?.id ?? null,
    phone,
    customer: { name: input.name, email: input.email },
    description: `${c.product.name} — ${c.offer.name}`.slice(0, 255),
    imageUrl: c.imageUrl ?? c.product.imageUrl ?? null,
  });
  await trackEvent({ type: EVENT_TYPES.CHECKOUT_SUBMIT, ownerId: c.ownerId, isDemo: false, checkoutId: c.id, orderId: created.orderId, meta: { provider: provider.id, method: method?.id ?? null } });
  if (charge.notStarted) return { kind: "payment_not_started", message: charge.notStarted };
  return { kind: "payment_started", token: created.publicToken, redirectUrl: charge.redirectUrl };
}

class CouponExhausted extends Error {}

export async function chargeWithProvider(
  provider: PaymentProvider,
  created: { orderId: string; orderCode: string; publicToken: string; paymentId: string; reference: string; ownerId: string },
  details: { amountCents: number; currency: PublicCheckout["offer"]["currency"]; method: string | null; phone: string | null; customer: { name: string; email: string }; description: string; imageUrl: string | null },
): Promise<{ redirectUrl: string | null; notStarted?: string }> {
  const base = await resolveAppBaseUrl();
  let result;
  try {
    result = await provider.createCharge({
      reference: created.reference,
      orderCode: created.orderCode,
      returnUrl: `${base}/pagamento/${created.publicToken}`,
      cancelUrl: `${base}/pagamento/${created.publicToken}?desistiu=1`,
      callbackUrl: `${base}/api/webhooks/${provider.id}`,
      ...details,
    });
  } catch (e) {
    result = { kind: "error" as const, reason: e instanceof Error ? e.message : "erro desconhecido", retryable: true };
  }

  switch (result.kind) {
    case "redirect":
      await prisma.payment.update({ where: { id: created.paymentId }, data: { status: "PENDING", externalId: result.externalId, redirectUrl: result.url } });
      await recordOrderEventSafe("pending", created.orderId);
      return { redirectUrl: result.url };
    case "pending":
      await prisma.payment.update({ where: { id: created.paymentId }, data: { status: "PENDING", externalId: result.externalId } });
      await recordOrderEventSafe("pending", created.orderId);
      return { redirectUrl: null };
    case "not_created": {
      // Nada foi criado nem cobrado no fornecedor: a tentativa e a encomenda são encerradas e o comprador pode repetir.
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({ where: { id: created.paymentId }, data: { status: "FAILED", failureReason: `Não iniciado: ${result.reason}`.slice(0, 200) } });
        const upd = await tx.order.updateMany({ where: { id: created.orderId, status: "PENDING" }, data: { status: "CANCELED", canceledAt: new Date() } });
        if (upd.count === 1) {
          const o = await tx.order.findUniqueOrThrow({ where: { id: created.orderId } });
          if (o.couponId) await tx.$executeRaw`UPDATE "Coupon" SET "usesCount" = GREATEST("usesCount" - 1, 0) WHERE "id" = ${o.couponId}`;
          await audit(tx, created.orderId, "PENDING", "CANCELED", `charge-response:${provider.id}`, "Pagamento não iniciado pelo fornecedor");
        }
      });
      await prisma.integrationLog.create({ data: { ownerId: created.ownerId, provider: provider.id, level: "error", message: `Pagamento não iniciado para ${created.orderCode}: ${result.reason}`.slice(0, 500) } });
      await recordOrderEventSafe("failed", created.orderId);
      return { redirectUrl: null, notStarted: result.userMessage };
    }
    case "paid":
      await prisma.payment.update({ where: { id: created.paymentId }, data: { status: "PENDING", externalId: result.externalId } });
      await applyPaymentStatus(provider.id, { externalId: result.externalId, reference: created.reference, state: "paid", amountCents: result.amountCents, currency: result.currency, feeCents: result.feeCents, rawStatus: result.rawStatus }, "charge-response", { ownerId: created.ownerId });
      return { redirectUrl: null };
    case "failed":
      await prisma.payment.update({ where: { id: created.paymentId }, data: { externalId: result.externalId, failureReason: result.reason.slice(0, 200) } });
      await applyPaymentStatus(provider.id, { externalId: result.externalId, reference: created.reference, state: "failed", amountCents: null, currency: null, feeCents: null, rawStatus: result.rawStatus ?? "failed" }, "charge-response", { ownerId: created.ownerId });
      return { redirectUrl: null };
    case "error":
      // Estado incerto: a encomenda fica pendente e será verificada por consulta oficial; nunca se assume sucesso.
      await prisma.payment.update({ where: { id: created.paymentId }, data: { status: "PENDING", failureReason: `Estado incerto: ${result.reason}`.slice(0, 200) } });
      await prisma.integrationLog.create({ data: { ownerId: created.ownerId, provider: provider.id, level: "error", message: `Falha ao criar pagamento para ${created.orderCode} (estado incerto).` } });
      await recordOrderEventSafe("pending", created.orderId);
      return { redirectUrl: null };
  }
}

// ───────────── Página de estado do pagamento ─────────────

export type PublicPaymentState = "processing" | "pending" | "paid" | "failed" | "canceled" | "refunded";

const STATUS_CHECK_INTERVAL_MS = 8_000;

/** Atualiza o estado através da consulta oficial do fornecedor, no máximo uma vez a cada 8 segundos. */
export async function refreshPaymentStatus(orderId: string): Promise<void> {
  return refreshOne(orderId);
}

async function refreshOne(orderId: string): Promise<void> {
  const payment = await prisma.payment.findFirst({ where: { orderId, status: { in: ["CREATED", "PENDING"] } }, orderBy: { createdAt: "desc" }, include: { order: { select: { ownerId: true } } } });
  if (!payment) return;
  if (payment.lastCheckedAt && Date.now() - payment.lastCheckedAt.getTime() < STATUS_CHECK_INTERVAL_MS) return;
  // Consulta com as credenciais da conta dona da encomenda
  const ownerId = payment.order.ownerId;
  const provider = await getProvider(payment.provider, ownerId);
  // Nota: um gateway desativado continua a confirmar pagamentos já iniciados (só deixa de aceitar novos).
  if (!provider || !provider.isConfigured() || !provider.getStatus) return;
  // marca a verificação antes da chamada para limitar pedidos concorrentes
  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(Date.now() - STATUS_CHECK_INTERVAL_MS) } }] },
    data: { lastCheckedAt: new Date() },
  });
  if (claimed.count !== 1) return;
  try {
    const status = await provider.getStatus(payment.externalId, payment.idempotencyKey);
    if (status.state !== "pending") await applyPaymentStatus(provider.id, status, "status-check", { ownerId });
  } catch {
    await prisma.integrationLog.create({ data: { ownerId, provider: provider.id, level: "warn", message: "Falha na consulta de estado; nova tentativa mais tarde." } });
  }
}

export async function getPaymentView(publicToken: string, opts: { refresh?: boolean } = {}) {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(publicToken)) return null;
  let order = await prisma.order.findUnique({ where: { publicToken }, select: { id: true, status: true } });
  if (!order) return null;
  if (opts.refresh && order.status === "PENDING") await refreshPaymentStatus(order.id);
  const full = await prisma.order.findUnique({
    where: { publicToken },
    include: {
      items: { select: { description: true, totalCents: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      delivery: { select: { token: true } },
      checkout: { select: { primaryColor: true, backgroundColor: true, successTitle: true, successMessage: true, supportEmail: true, publicId: true } },
    },
  });
  order = full;
  if (!full) return null;
  const p = full.payments[0];
  const state: PublicPaymentState =
    full.status === "APPROVED"
      ? "paid"
      : full.status === "DECLINED"
        ? "failed"
        : full.status === "CANCELED"
          ? "canceled"
          : full.status === "REFUNDED"
            ? "refunded"
            : p?.status === "CREATED"
              ? "processing"
              : "pending";
  return {
    state,
    code: full.code,
    ownerId: full.ownerId,
    totalCents: full.totalCents,
    discountCents: full.discountCents,
    currency: full.currency,
    items: full.items,
    method: p?.method ?? null,
    phoneMasked: p?.phoneMasked ?? null,
    // Retomar o pagamento na página do fornecedor (apenas enquanto pendente)
    continueUrl: full.status === "PENDING" && p?.status === "PENDING" ? (p.redirectUrl ?? null) : null,
    isTestPayment: full.isTestPayment,
    uncertain: Boolean(p?.failureReason?.startsWith("Estado incerto")),
    // Fornecedor sem consulta de estado (E2Payments): a loja verifica manualmente, nunca automaticamente "pago"
    manualReview: Boolean(p?.failureReason?.startsWith("Estado incerto")) && !(await getProvider(p!.provider, full.ownerId))?.getStatus,
    // A ligação de acesso só existe depois de o pagamento estar confirmado
    accessToken: state === "paid" ? (full.delivery?.token ?? null) : null,
    checkout: full.checkout,
  };
}
export type PaymentView = NonNullable<Awaited<ReturnType<typeof getPaymentView>>>;

// ───────────── Entrega do produto digital ─────────────

export async function getDeliveryView(deliveryToken: string) {
  if (!/^[A-Za-z0-9_-]{30,40}$/.test(deliveryToken)) return null;
  const d = await prisma.delivery.findUnique({
    where: { token: deliveryToken },
    include: { order: { include: { items: { include: { product: { select: { id: true, name: true, deliveryUrl: true, deliveryMethod: true, deliveryFileId: true, supportEmail: true, supportWhatsApp: true, supportMessage: true } } } } } } },
  });
  // Acesso só para encomendas pagas (reembolsos revogam o acesso)
  if (!d || d.order.status !== "APPROVED" || d.order.isDemo) return null;
  await prisma.delivery.update({ where: { id: d.id }, data: { accessCount: { increment: 1 }, lastAccessAt: new Date() } });
  return {
    code: d.order.code,
    ownerId: d.order.ownerId,
    // acesso de cada produto conforme o método de entrega escolhido (página interna ou link externo)
    items: d.order.items.map((i) => {
      const target = accessTarget(i.product, deliveryToken);
      const legacyUrl = !i.product.deliveryMethod && i.product.deliveryUrl ? i.product.deliveryUrl : null;
      return { name: i.product.name, url: target?.href ?? legacyUrl, internal: target?.kind === "internal", support: supportLink(i.product.supportWhatsApp, i.product.supportMessage) };
    }),
  };
}

/** Reconciliação: consulta oficial de pagamentos pendentes (ex.: comprador fechou a página e o aviso não chegou). */
export async function reconcilePendingPayments(ownerId: string, limit = 30): Promise<{ checked: number; changed: number }> {
  const pending = await prisma.payment.findMany({
    where: { status: { in: ["CREATED", "PENDING"] }, externalId: { not: null }, order: { status: "PENDING", isDemo: false, ownerId } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { orderId: true },
  });
  let changed = 0;
  for (const p of pending) {
    await refreshOne(p.orderId);
    const o = await prisma.order.findUnique({ where: { id: p.orderId }, select: { status: true } });
    if (o && o.status !== "PENDING") changed++;
  }
  return { checked: pending.length, changed };
}

/** Pagamento sem resposta do fornecedor e sem consulta de estado documentada (ex.: E2Payments): precisa de verificação manual. */
export async function needsManualVerification(payment: { provider: string; status: string; failureReason: string | null }, ownerId: string): Promise<boolean> {
  if (!["CREATED", "PENDING"].includes(payment.status) || !payment.failureReason?.startsWith("Estado incerto")) return false;
  const provider = await getProvider(payment.provider, ownerId);
  return Boolean(provider && !provider.getStatus);
}

/**
 * Resolução manual pelo dono da loja, depois de verificar a transação no painel do fornecedor.
 * Só se aplica a pagamentos "por verificar" de fornecedores sem consulta de estado; fica registada na auditoria.
 * O comprador nunca tem acesso a esta operação.
 */
export async function resolveUncertainPayment(orderId: string, outcome: "paid" | "failed", actor: string, ownerId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  // Só o dono da venda (conta da sessão) pode resolver o pagamento da sua encomenda
  const order = await prisma.order.findFirst({ where: { id: orderId, isDemo: false, ownerId }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
  const payment = order?.payments[0];
  if (!order || !payment || order.status !== "PENDING" || !(await needsManualVerification(payment, ownerId))) {
    return { ok: false, error: "Este pagamento não está por verificar." };
  }
  const r = await applyPaymentStatus(
    payment.provider,
    { externalId: payment.externalId, reference: payment.idempotencyKey, state: outcome, amountCents: outcome === "paid" ? payment.amountCents : null, currency: outcome === "paid" ? payment.currency : null, feeCents: null, rawStatus: `manual_${outcome}` },
    "manual-verification",
    { ownerId },
  );
  if (r.result === "rejected") return { ok: false, error: r.reason ?? "Não foi possível atualizar o pagamento." };
  // a transição já fica na auditoria da encomenda (manual-verification:<fornecedor>); aqui regista-se quem a fez
  await prisma.integrationLog.create({ data: { ownerId, provider: payment.provider, level: "info", message: `Pagamento ${order.code} marcado como ${outcome === "paid" ? "pago" : "não pago"} após verificação manual por ${actor}.`.slice(0, 500) } });
  return { ok: true };
}
