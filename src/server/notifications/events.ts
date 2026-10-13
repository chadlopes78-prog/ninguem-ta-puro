// Geração de notificações a partir de eventos confiáveis (confirmação no servidor, reembolso registado, resumo).
//
// Garantias:
//  - idempotência: (userId, eventKey) é único — repetir o mesmo evento (webhook repetido, consulta de estado,
//    nova tentativa) nunca cria uma segunda notificação nem um segundo envio push;
//  - nada se perde: notificação e entregas push são gravadas na MESMA transação que altera o pedido; o envio
//    em si é feito depois (fila persistente PushDelivery), com tentativas limitadas;
//  - canais separados: a notificação interna existe sempre (se a categoria estiver ativa); o push é opcional.
import "server-only";
import type { NotificationType, Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { DEFAULT_PREFS, isAllowed, type NotificationPrefs } from "@/lib/notifications";
import { newReceiptToken } from "./push";

type Tx = Prisma.TransactionClient | PrismaClient;

export interface NotificationDraft {
  type: NotificationType;
  eventKey: string;
  title: string;
  body: string;
  url?: string | null;
  orderId?: string | null;
}

function prefsOf(p: Partial<NotificationPrefs> | null | undefined): NotificationPrefs {
  return { ...DEFAULT_PREFS, ...(p ?? {}) };
}

/**
 * Cria a notificação para os utilizadores indicados (sempre a conta dona do evento) com a categoria ativa e põe na
 * fila o envio push para os seus dispositivos ativos. Contas sem acesso (pendentes, rejeitadas, suspensas) não
 * recebem alertas. Devolve quantas notificações novas foram criadas (0 se o evento já tinha sido tratado).
 */
export async function notifyUsers(tx: Tx, draft: NotificationDraft, opts: { userIds: string[] }): Promise<number> {
  if (!opts.userIds.length) return 0;
  const users = await tx.user.findMany({
    where: { id: { in: opts.userIds }, status: "APPROVED", bannedAt: null },
    select: { id: true, notificationPreference: true },
  });
  const targets = users.filter((u) => isAllowed(prefsOf(u.notificationPreference), draft.type));
  if (!targets.length) return 0;
  // ON CONFLICT DO NOTHING: não aborta a transação quando o evento já existe
  const created = await tx.notification.createManyAndReturn({
    data: targets.map((u) => ({
      userId: u.id,
      type: draft.type,
      eventKey: draft.eventKey.slice(0, 120),
      title: draft.title.slice(0, 120),
      body: draft.body.slice(0, 500),
      url: draft.url ?? null,
      orderId: draft.orderId ?? null,
    })),
    skipDuplicates: true,
    select: { id: true, userId: true },
  });
  if (!created.length) return 0;
  const pushUsers = new Set(targets.filter((u) => prefsOf(u.notificationPreference).pushEnabled).map((u) => u.id));
  const subs = await tx.pushSubscription.findMany({ where: { userId: { in: [...pushUsers] }, revokedAt: null }, select: { id: true, userId: true } });
  const deliveries = created.flatMap((n) => subs.filter((s) => s.userId === n.userId).map((s) => ({ notificationId: n.id, subscriptionId: s.id, receiptToken: newReceiptToken() })));
  if (deliveries.length) await tx.pushDelivery.createMany({ data: deliveries, skipDuplicates: true });
  return created.length;
}

// ───────────── Eventos de pedidos ─────────────

export type OrderEvent = "sale" | "pending" | "failed";

async function orderSummary(tx: Tx, orderId: string) {
  return tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, code: true, ownerId: true, isDemo: true, isTestPayment: true, totalCents: true, currency: true, status: true, items: { select: { product: { select: { name: true } } } } },
  });
}

/**
 * Evento de pedido real (nunca demonstração). Chamado só a partir do fluxo confiável:
 * sale → depois de `applyPaymentStatus` aprovar a encomenda (dentro da mesma transação);
 * failed → quando a encomenda passa a recusada/cancelada por estado do gateway;
 * pending → quando o gateway aceita iniciar o pagamento e aguarda confirmação.
 */
export async function recordOrderEvent(tx: Tx, event: OrderEvent, orderId: string): Promise<number> {
  const o = await orderSummary(tx, orderId);
  if (!o || o.isDemo) return 0;
  const product = [...new Set(o.items.map((i) => i.product.name))].join(", ") || "—";
  const value = formatMoney(o.totalCents, o.currency as CurrencyCode);
  const test = o.isTestPayment ? " (teste)" : "";
  const url = `/pedidos/${o.id}`;
  // Só a conta dona da venda é notificada
  const to = { userIds: [o.ownerId] };
  if (event === "sale") {
    return notifyUsers(tx, {
      type: "SALE_CONFIRMED",
      eventKey: `sale:${o.id}`,
      title: o.isTestPayment ? "Pagamento de teste confirmado" : "Nova venda confirmada!",
      body: `Produto: ${product}\nValor: ${value}${test}`,
      url,
      orderId: o.id,
    }, to);
  }
  if (event === "pending") {
    return notifyUsers(tx, { type: "PAYMENT_PENDING", eventKey: `pending:${o.id}`, title: "Pagamento pendente.", body: `Pedido: ${o.code}${test}\nAinda não é uma venda: aguarda confirmação do gateway.`, url, orderId: o.id }, to);
  }
  return notifyUsers(tx, { type: "PAYMENT_FAILED", eventKey: `failed:${o.id}`, title: "Pagamento não concluído", body: `O pagamento do pedido ${o.code} não foi concluído.${test}`, url, orderId: o.id }, to);
}

/** Igual a recordOrderEvent, fora de transação, sem nunca interromper o fluxo de pagamento. */
export async function recordOrderEventSafe(event: OrderEvent, orderId: string): Promise<void> {
  try {
    if ((await recordOrderEvent(prisma, event, orderId)) > 0) {
      const { schedulePushDispatch } = await import("./push");
      await schedulePushDispatch();
    }
  } catch (e) {
    console.error("[notificações] evento", event, e);
  }
}

export async function recordRefundEvent(tx: Tx, refund: { id: string; orderId: string; ownerId: string; amountCents: number; currency: CurrencyCode; full: boolean }, orderCode: string): Promise<number> {
  return notifyUsers(tx, {
    type: "REFUND_CONFIRMED",
    eventKey: `refund:${refund.id}`,
    title: "Reembolso confirmado.",
    body: `Valor: ${formatMoney(refund.amountCents, refund.currency)}\nPedido: ${orderCode}${refund.full ? " (total)" : " (parcial)"}`,
    url: `/pedidos/${refund.orderId}`,
    orderId: refund.orderId,
  }, { userIds: [refund.ownerId] });
}
