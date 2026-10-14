// Percurso pós-compra REAL (funis): upsell e página de obrigado.
//
// Regras:
//  - nada acontece antes de a compra inicial estar APPROVED (confirmada pelo processador no servidor);
//  - aceitar um upsell cria uma NOVA encomenda (pedido e pagamento próprios, ligados à compra inicial),
//    cobrada pelo mesmo fluxo/gateways do checkout — nunca é paga por um clique;
//  - recusar ou falhar o upsell nunca altera a compra inicial;
//  - os destinos são sempre calculados no servidor a partir do estado real das encomendas (nunca do URL).
import "server-only";
import { randomBytes } from "crypto";
import { Prisma, type Order } from "@prisma/client";
import { prisma } from "@/server/db";
import { newOrderCode, newRunId } from "@/lib/ids";
import { advanceToInteractive, nextKey } from "@/lib/funnels/simulate";
import { OFFER_STEP_TYPES, type FunnelGraph, type GraphNode } from "@/lib/funnels/types";
import { buttonLabel, parseThankYouAction, parseThankYouDesign, whatsappLink, defaultThankYouDesign, type ThankYouDesign } from "@/lib/thank-you";
import { getActivePaymentProviders } from "@/server/payments/registry";
import { supportLink } from "@/lib/product-setup";
import { accessTarget } from "./delivery";
import { audit } from "@/server/payments/confirm";
import { toGraph } from "./funnels";
import { chargeWithProvider, maskPhone, normalizeMzPhone, refreshPaymentStatus, resolvePaymentOption, listPaymentOptions, type PaymentOptionView } from "./payment-flow";
import { EVENT_TYPES, trackEvent } from "./analytics";

const token = () => randomBytes(18).toString("base64url");
const RUN_RE = /^[A-Za-z0-9]{10,40}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,40}$/;

type FunnelWithGraph = Prisma.FunnelGetPayload<{ include: { steps: true; edges: true } }>;

function entryNext(graph: FunnelGraph, checkoutId: string | null): GraphNode | null {
  const entry = graph.nodes.find((n) => n.type === "CHECKOUT" && n.config.checkoutId === checkoutId) ?? graph.nodes.find((n) => n.type === "CHECKOUT");
  const after = entry ? nextKey(graph, entry.key, "next") : null;
  return after ? advanceToInteractive(graph, after) : null;
}

/** Percurso real da compra inicial (um por encomenda, criado apenas depois da confirmação do pagamento). */
async function ensureRun(root: Order, funnel: FunnelWithGraph) {
  const existing = await prisma.funnelRun.findUnique({ where: { orderId: root.id } });
  if (existing) return existing;
  const first = entryNext(toGraph(funnel), root.checkoutId);
  if (!first) return null;
  try {
    return await prisma.funnelRun.create({
      data: { id: newRunId(), funnelId: funnel.id, orderId: root.id, currentStepKey: first.key, ownerId: root.ownerId, isDemo: false, history: [], completedAt: OFFER_STEP_TYPES.includes(first.type) ? null : new Date() },
    });
  } catch (e) {
    // pedidos simultâneos: a restrição única garante um só percurso
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return prisma.funnelRun.findUnique({ where: { orderId: root.id } });
    throw e;
  }
}

export type Destination = { kind: "upsell" | "thank_you" | "external"; url: string } | null;

const thankYouUrl = (root: { publicToken: string | null }, extra = "") => `/obrigado/${root.publicToken}${extra}`;

/**
 * Próximo destino para uma encomenda (compra inicial ou upsell), com base apenas no estado real no servidor.
 * Devolve null quando não há funil ou o pagamento ainda não está confirmado.
 */
export async function nextDestination(publicToken: string): Promise<Destination> {
  if (!TOKEN_RE.test(publicToken)) return null;
  const order = await prisma.order.findUnique({ where: { publicToken }, include: { parentOrder: true } });
  if (!order || order.isDemo) return null;
  const root = order.parentOrder ?? order;
  if (root.status !== "APPROVED" || !root.funnelId) return null;
  const funnel = await prisma.funnel.findUnique({ where: { id: root.funnelId }, include: { steps: true, edges: true } });
  if (!funnel) return null;
  const graph = toGraph(funnel);
  const run = await ensureRun(root, funnel);
  if (!run) return null;

  // Compra inicial
  if (!order.parentOrderId) {
    const node = graph.nodes.find((n) => n.key === run.currentStepKey);
    if (node && OFFER_STEP_TYPES.includes(node.type) && !run.completedAt) {
      // upsell já aceite e pago/pendente: segue o estado dessa encomenda
      const child = await prisma.order.findFirst({ where: { parentOrderId: root.id, funnelStepKey: node.key }, orderBy: { createdAt: "desc" } });
      if (child?.status === "APPROVED" || child?.status === "PENDING") return child.publicToken ? nextDestination(child.publicToken) : null;
      return { kind: "upsell", url: `/oferta/${run.id}` };
    }
    return { kind: "thank_you", url: thankYouUrl(root) };
  }

  // Encomenda de upsell
  const step = graph.nodes.find((n) => n.key === order.funnelStepKey);
  const c = step?.config ?? {};
  if (order.status === "APPROVED") {
    await completeRun(run.id, order.funnelStepKey!, "accept", graph, "paid");
    if (c.afterAccept === "url" && c.afterAcceptUrl) return { kind: "external", url: c.afterAcceptUrl };
    return { kind: "thank_you", url: thankYouUrl(root) };
  }
  if (order.status === "DECLINED" || order.status === "CANCELED") {
    if (c.afterFail === "retry" && run.currentStepKey === order.funnelStepKey && !run.completedAt) return { kind: "upsell", url: `/oferta/${run.id}?pagamento=falhou` };
    await completeRun(run.id, order.funnelStepKey!, "decline", graph, "payment_failed");
    return { kind: "thank_you", url: thankYouUrl(root, "?oferta=nao-paga") };
  }
  return null; // pendente: continua na página de estado do pagamento
}

/** Avança o percurso uma única vez (condição sobre a etapa atual evita repetições). */
async function completeRun(runId: string, stepKey: string, handle: "accept" | "decline", graph: FunnelGraph, reason: string) {
  const run = await prisma.funnelRun.findUnique({ where: { id: runId } });
  if (!run || run.completedAt || run.currentStepKey !== stepKey) return;
  const target = nextKey(graph, stepKey, handle);
  const history = [...((run.history as Prisma.JsonArray) ?? []), { key: stepKey, decision: handle, reason, at: new Date().toISOString() }];
  await prisma.funnelRun.updateMany({
    where: { id: runId, currentStepKey: stepKey, completedAt: null },
    data: { currentStepKey: target ?? stepKey, completedAt: new Date(), history },
  });
}

// ───────────── Página de upsell (real) ─────────────

export async function getRealOfferView(runId: string) {
  if (!RUN_RE.test(runId)) return null;
  const run = await prisma.funnelRun.findUnique({
    where: { id: runId },
    include: { funnel: { include: { steps: true, edges: true } }, order: { include: { customer: true, checkout: { include: { design: { select: { published: true } } } } } } },
  });
  if (!run || run.isDemo || !run.order) return null;
  const root = run.order;
  // Sem compra inicial confirmada não há acesso à etapa seguinte
  if (root.status !== "APPROVED") return { run, root, blocked: true as const };
  const graph = toGraph(run.funnel);
  const node = graph.nodes.find((n) => n.key === run.currentStepKey) ?? null;
  const active = Boolean(node && OFFER_STEP_TYPES.includes(node.type) && !run.completedAt);
  const offer =
    active && node?.config.offerId
      ? await prisma.offer.findFirst({ where: { id: node.config.offerId, productId: node.config.productId, isActive: true, product: { ownerId: root.ownerId, isDemo: false, status: { not: "ARCHIVED" } } }, include: { product: true } })
      : null;
  const child = node ? await prisma.order.findFirst({ where: { parentOrderId: root.id, funnelStepKey: node.key }, orderBy: { createdAt: "desc" } }) : null;
  // Gateways da conta dona da venda inicial (o upsell é pago à mesma conta)
  const providers = (await getActivePaymentProviders(root.ownerId)).filter((p) => !offer || p.supportedCurrencies.includes(offer.currency));
  const options: PaymentOptionView[] = listPaymentOptions(providers);
  return {
    run,
    root,
    blocked: false as const,
    node,
    active,
    offer,
    child,
    options,
    phoneHint: root.customer.phone && normalizeMzPhone(root.customer.phone) ? maskPhone(normalizeMzPhone(root.customer.phone)!) : null,
  };
}

export type UpsellOutcome =
  | { kind: "payment_started"; token: string; redirectUrl: string | null }
  | { kind: "invalid"; fieldErrors: Record<string, string> }
  | { kind: "unavailable"; message: string }
  | { kind: "payment_not_started"; message: string };

/**
 * Aceitar o upsell: cria uma encomenda própria (ligada à compra inicial) e inicia a cobrança no gateway escolhido.
 * O preço vem da oferta na base de dados. Submissões repetidas devolvem a mesma encomenda.
 */
export async function acceptUpsell(runId: string, stepKey: string, input: { method?: string; phone?: string; idempotencyKey?: string }): Promise<UpsellOutcome> {
  const view = await getRealOfferView(runId);
  if (!view || view.blocked) return { kind: "unavailable", message: "Esta oferta não está disponível." };
  const { run, root, node, active, offer, child } = view;
  if (!node || node.key !== stepKey || !active || !offer) return { kind: "unavailable", message: "Esta oferta já não está disponível." };
  if (offer.currency !== root.currency) return { kind: "unavailable", message: "Esta oferta não pode ser paga nesta moeda." };
  // Já existe um pagamento desta oferta em curso ou concluído: nunca se cobra duas vezes
  if (child && (child.status === "PENDING" || child.status === "APPROVED")) return { kind: "payment_started", token: child.publicToken!, redirectUrl: null };

  const providers = (await getActivePaymentProviders(root.ownerId)).filter((p) => p.supportedCurrencies.includes(offer.currency));
  if (providers.length === 0) return { kind: "unavailable", message: "Não existem métodos de pagamento disponíveis de momento. Nada foi cobrado." };
  const selected = resolvePaymentOption(providers, input.method);
  if (!selected) return { kind: "invalid", fieldErrors: { method: "Escolha um método de pagamento" } };
  const { provider, method } = selected;
  let phone: string | null = null;
  if (method?.requiresPhone) {
    // número em branco = o mesmo da compra inicial
    phone = normalizeMzPhone(input.phone?.trim() ? input.phone : (view.root.customer.phone ?? ""));
    if (!phone) return { kind: "invalid", fieldErrors: { phone: "Introduza um número móvel moçambicano válido (ex.: 84 123 4567)" } };
    if (method.phonePrefixes?.length && !method.phonePrefixes.some((p) => phone!.startsWith(p))) {
      return { kind: "invalid", fieldErrors: { phone: `O número ${method.label} deve começar por ${method.phonePrefixes.join(" ou ")}.` } };
    }
  }
  const idem = input.idempotencyKey && /^[A-Za-z0-9_-]{16,64}$/.test(input.idempotencyKey) ? input.idempotencyKey : null;
  if (!idem) return { kind: "invalid", fieldErrors: { _form: "Pedido inválido. Atualize a página e tente novamente." } };
  const again = await prisma.order.findUnique({ where: { idempotencyKey: idem } });
  if (again) return again.parentOrderId === root.id ? { kind: "payment_started", token: again.publicToken!, redirectUrl: null } : { kind: "invalid", fieldErrors: { _form: "Pedido inválido." } };

  const environment = provider.environment();
  const description = `${offer.product.name} — ${offer.name}`;
  let created: { orderId: string; orderCode: string; publicToken: string; paymentId: string; reference: string; ownerId: string };
  try {
    created = await prisma.$transaction(async (tx) => {
      const publicToken = token();
      const order = await tx.order.create({
        data: {
          code: newOrderCode(),
          customerId: root.customerId,
          checkoutId: root.checkoutId,
          funnelId: root.funnelId,
          parentOrderId: root.id,
          funnelStepKey: node.key,
          status: "PENDING",
          source: "CHECKOUT",
          currency: offer.currency,
          subtotalCents: offer.priceCents,
          discountCents: 0,
          totalCents: offer.priceCents,
          netCents: offer.priceCents,
          provider: provider.id,
          paymentMethod: method?.id ?? null,
          publicToken,
          idempotencyKey: idem,
          ownerId: root.ownerId,
          isDemo: false,
          isTestPayment: environment === "test",
          items: { create: { productId: offer.productId, offerId: offer.id, kind: "UPSELL", description, unitPriceCents: offer.priceCents, quantity: 1, totalCents: offer.priceCents } },
        },
      });
      const reference = `${order.code}-${token().slice(0, 8)}`;
      const payment = await tx.payment.create({
        data: { orderId: order.id, provider: provider.id, method: method?.id ?? null, environment, phoneMasked: phone ? maskPhone(phone) : null, amountCents: offer.priceCents, currency: offer.currency, status: "CREATED", idempotencyKey: reference },
      });
      await audit(tx, order.id, null, "PENDING", "funnel-upsell", `Upsell aceite (compra inicial ${root.code}); pagamento iniciado`);
      return { orderId: order.id, orderCode: order.code, publicToken, paymentId: payment.id, reference, ownerId: root.ownerId };
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const dup = await prisma.order.findUnique({ where: { idempotencyKey: idem } });
      if (dup?.publicToken) return { kind: "payment_started", token: dup.publicToken, redirectUrl: null };
    }
    throw e;
  }

  const customer = view.root.customer;
  const charge = await chargeWithProvider(provider, created, {
    amountCents: offer.priceCents,
    currency: offer.currency,
    method: method?.id ?? null,
    phone,
    customer: { name: customer.name, email: customer.email },
    description: description.slice(0, 255),
    imageUrl: offer.product.imageUrl ?? null,
  });
  await trackEvent({ type: EVENT_TYPES.OFFER_ACCEPT, ownerId: root.ownerId, isDemo: false, funnelId: run.funnelId, orderId: created.orderId, stepKey: node.key, meta: { provider: provider.id } });
  if (charge.notStarted) return { kind: "payment_not_started", message: charge.notStarted };
  return { kind: "payment_started", token: created.publicToken, redirectUrl: charge.redirectUrl };
}

/** Recusar o upsell: a compra inicial fica intacta e o comprador segue para o destino configurado. */
export async function declineUpsell(runId: string, stepKey: string): Promise<Destination> {
  const view = await getRealOfferView(runId);
  if (!view || view.blocked) return null;
  const { run, root, node } = view;
  const graph = toGraph(run.funnel);
  const step = graph.nodes.find((n) => n.key === stepKey);
  if (!step || !OFFER_STEP_TYPES.includes(step.type)) return null;
  // Um upsell já pago ou em pagamento não pode ser "recusado" depois
  if (view.child && (view.child.status === "APPROVED" || view.child.status === "PENDING")) return view.child.publicToken ? nextDestination(view.child.publicToken) : null;
  if (node?.key === stepKey && view.active) {
    await completeRun(run.id, stepKey, "decline", graph, "declined");
    await trackEvent({ type: EVENT_TYPES.OFFER_DECLINE, ownerId: root.ownerId, isDemo: false, funnelId: run.funnelId, orderId: root.id, stepKey });
  }
  if (step.config.afterDecline === "url" && step.config.afterDeclineUrl) return { kind: "external", url: step.config.afterDeclineUrl };
  return { kind: "thank_you", url: thankYouUrl(root) };
}

// ───────────── Página de obrigado ─────────────

export type ThankYouState = "confirmed" | "pending" | "failed";

export async function getThankYouView(publicToken: string, opts: { refresh?: boolean } = {}) {
  if (!TOKEN_RE.test(publicToken)) return null;
  let order = await prisma.order.findUnique({ where: { publicToken }, select: { id: true, status: true, parentOrderId: true } });
  if (!order) return null;
  const rootId = order.parentOrderId ?? order.id;
  if (opts.refresh) {
    const r = await prisma.order.findUnique({ where: { id: rootId }, select: { status: true } });
    if (r?.status === "PENDING") await refreshPaymentStatus(rootId);
  }
  const root = await prisma.order.findUnique({
    where: { id: rootId },
    include: {
      items: { include: { product: { select: { id: true, name: true, deliveryMethod: true, deliveryUrl: true, supportWhatsApp: true, supportMessage: true } } } },
      delivery: { select: { token: true } },
      customer: { select: { name: true } },
      checkout: { select: { supportEmail: true, publicId: true, slug: true } },
      funnel: { include: { thankYouPage: true } },
      upsellOrders: { include: { items: true, delivery: { select: { token: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  order = null;
  if (!root || root.isDemo) return null;
  const page = root.funnel?.thankYouPage ?? null;
  const design: ThankYouDesign = page ? parseThankYouDesign(page.design) : defaultThankYouDesign();
  const action = page ? parseThankYouAction(page.action) : null;
  const state: ThankYouState = root.status === "APPROVED" ? "confirmed" : root.status === "PENDING" ? "pending" : "failed";

  // Produto comprado (o do funil, senão o primeiro da encomenda): a entrega e o suporte são DESTE produto
  const product = root.items.find((i) => i.product.id === root.funnel?.productId)?.product ?? root.items[0]?.product ?? null;

  // Botões: só existem com a compra confirmada. Suporte WhatsApp (acima) + acesso ao produto (abaixo).
  let button: { label: string; href: string; external: boolean } | null = null;
  let buttonKind: "pdf" | "link" | "whatsapp" | "access" | null = null;
  let support: { href: string; label: string } | null = null;
  if (state === "confirmed") {
    const wa = product ? supportLink(product.supportWhatsApp, product.supportMessage) : null;
    if (wa) support = { href: wa, label: "Precisa de ajuda? Fale connosco no WhatsApp" };
    else if (action?.type === "whatsapp") support = { href: whatsappLink(action.phone, action.message), label: "Precisa de ajuda? Fale connosco no WhatsApp" };
    const target = product ? accessTarget(product, root.delivery?.token ?? null) : null;
    if (target) [button, buttonKind] = [{ label: "Aceder ao meu produto", href: target.href, external: target.external }, target.kind === "internal" ? "access" : "link"];
    // configuração anterior (produtos sem método de entrega escolhido): mantém o comportamento antigo
    else if (action?.type === "whatsapp") [button, buttonKind] = [root.delivery ? { label: "Aceder ao meu produto", href: `/acesso/${root.delivery.token}`, external: false } : null, root.delivery ? "access" : null];
    else if (action?.type === "product" && action.delivery === "link") [button, buttonKind] = [{ label: buttonLabel(action), href: action.url, external: true }, "link"];
    else if (action?.type === "product" && action.delivery === "pdf" && page?.fileId && root.delivery) [button, buttonKind] = [{ label: buttonLabel(action), href: `/acesso/${root.delivery.token}/ficheiro/${page.fileId}`, external: false }, "pdf"];
    else if (root.delivery) [button, buttonKind] = [{ label: "Aceder ao meu produto", href: `/acesso/${root.delivery.token}`, external: false }, "access"];
  }

  const upsells = root.upsellOrders.map((u) => ({
    code: u.code,
    description: u.items[0]?.description ?? "Oferta adicional",
    totalCents: u.totalCents,
    status: u.status,
    // acesso ao produto do upsell apenas quando esse pagamento foi confirmado
    accessHref: u.status === "APPROVED" && u.delivery ? `/acesso/${u.delivery.token}` : null,
  }));

  return {
    state,
    code: root.code,
    /** Conta dona da venda (para mostrar o nome do negócio dessa conta) */
    ownerId: root.ownerId,
    customerFirstName: root.customer.name.split(/\s+/)[0] ?? "",
    items: root.items.map((i) => ({ description: i.description, totalCents: i.totalCents })),
    totalCents: root.totalCents,
    currency: root.currency,
    design,
    button,
    buttonKind,
    support,
    actionType: action?.type ?? null,
    upsells,
    supportEmail: root.checkout?.supportEmail ?? null,
    retryPath: root.checkout ? `/checkout/${root.checkout.slug ?? root.checkout.publicId}` : null,
  };
}
export type ThankYouView = NonNullable<Awaited<ReturnType<typeof getThankYouView>>>;
