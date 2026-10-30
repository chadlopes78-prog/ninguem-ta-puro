// Aplicação centralizada e idempotente de estados de pagamento confirmados pelo fornecedor.
// Única via pela qual uma encomenda real passa a PAGA (APPROVED) — nunca pela página de retorno do browser.
import { randomBytes } from "crypto";
import type { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { NormalizedStatus } from "./types";
import { classifyOutcome } from "./outcome";
import { recordOrderEvent } from "@/server/notifications/events";
import { schedulePushDispatch } from "@/server/notifications/push";

export type ConfirmSource = "webhook" | "status-check" | "charge-response" | "manual-verification";
export type ConfirmResult = "processed" | "unchanged" | "ignored" | "rejected";

const PAYMENT_STATUS: Record<NormalizedStatus["state"], PaymentStatus> = {
  paid: "PAID",
  pending: "PENDING",
  failed: "FAILED",
  canceled: "CANCELED",
  expired: "EXPIRED",
};

async function log(provider: string, level: "info" | "warn" | "error", message: string, ownerId: string | null = null) {
  await prisma.integrationLog.create({ data: { ownerId, provider, level, message: message.slice(0, 500) } });
}

export function newDeliveryToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function audit(
  tx: Prisma.TransactionClient,
  orderId: string,
  from: OrderStatus | null,
  to: OrderStatus,
  actor: string,
  reason?: string,
) {
  await tx.orderAuditLog.create({ data: { orderId, fromStatus: from, toStatus: to, actor, reason: reason?.slice(0, 300) } });
}

/**
 * Aplica um estado confirmado a um pagamento e à encomenda associada.
 * Garantias:
 *  - valida referência, montante e moeda contra o que está guardado na base de dados;
 *  - transições condicionais (updateMany com o estado anterior) evitam corridas;
 *  - repetições não duplicam vendas, entregas nem utilizações de cupões.
 */
export async function applyPaymentStatus(
  provider: string,
  status: NormalizedStatus,
  source: ConfirmSource,
  /** Conta cujas credenciais validaram este estado: o pagamento tem de pertencer a essa conta */
  opts: { ownerId?: string } = {},
): Promise<{ result: ConfirmResult; reason?: string; orderId?: string }> {
  const payment =
    (status.externalId ? await prisma.payment.findUnique({ where: { provider_externalId: { provider, externalId: status.externalId } } }) : null) ??
    (status.reference ? await prisma.payment.findFirst({ where: { provider, idempotencyKey: status.reference } }) : null);

  if (!payment) {
    await log(provider, "warn", `Notificação/estado para pagamento desconhecido (${source}).`);
    return { result: "rejected", reason: "Pagamento desconhecido" };
  }
  const order = await prisma.order.findUniqueOrThrow({ where: { id: payment.orderId } });
  if (order.isDemo) return { result: "rejected", reason: "Encomenda de demonstração", orderId: order.id };
  // Um aviso validado com as credenciais da conta A nunca altera uma venda da conta B
  if (opts.ownerId && order.ownerId !== opts.ownerId) {
    await log(provider, "warn", `Estado de pagamento recebido com credenciais de outra conta para ${order.code}: ignorado.`, opts.ownerId);
    return { result: "rejected", reason: "Pagamento de outra conta" };
  }
  const ownerLog = (level: "info" | "warn" | "error", message: string) => log(provider, level, message, order.ownerId);

  // Referência cruzada: o externalId recebido não pode pertencer a outro pagamento
  if (payment.externalId && status.externalId && payment.externalId !== status.externalId) {
    await ownerLog("warn", `Referência externa não corresponde ao pagamento ${payment.id}.`);
    return { result: "rejected", reason: "Referência não corresponde", orderId: order.id };
  }

  if (status.state === "paid") {
    if (status.amountCents === null) {
      // Sem montante não é possível validar: não se assume sucesso
      await ownerLog("warn", `Confirmação sem montante para ${order.code}; requer consulta oficial.`);
      return { result: "ignored", reason: "Montante em falta", orderId: order.id };
    }
    if (status.amountCents !== payment.amountCents || status.amountCents !== order.totalCents) {
      await ownerLog("error", `Montante divergente em ${order.code}: recebido ${status.amountCents}, esperado ${payment.amountCents}.`);
      return { result: "rejected", reason: "Montante não corresponde", orderId: order.id };
    }
    if ((status.currency ?? null) !== payment.currency) {
      await ownerLog("error", `Moeda divergente em ${order.code}: recebido ${status.currency ?? "—"}, esperado ${payment.currency}.`);
      return { result: "rejected", reason: "Moeda não corresponde", orderId: order.id };
    }
  }

  const actor = `${source}:${provider}`;
  const now = new Date();
  // Resultado normalizado: o motivo devolvido pelo gateway decide entre «falhou» e «cancelado pelo cliente»
  // (apenas entre estados finais não pagos; pendente e pago nunca mudam por causa do texto).
  const outcome = classifyOutcome(status.state, status.failureMessage);
  const target = PAYMENT_STATUS[outcome.state];
  const terminalFailure = target === "FAILED" || target === "CANCELED" || target === "EXPIRED";

  const applied = await prisma.$transaction(async (tx) => {
    // Estado do pagamento — só se altera se for diferente; PAID é final (exceto reembolso futuro)
    if (payment.status === "PAID" && target !== "PAID") return { result: "ignored" as const, reason: "Pagamento já confirmado" };
    const moved = await tx.payment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: {
        status: target,
        rawStatus: status.rawStatus.slice(0, 100),
        externalId: payment.externalId ?? status.externalId,
        lastCheckedAt: now,
        ...(target === "PAID" ? { confirmedAt: now, failureReason: null, failureCode: null } : {}),
        ...(terminalFailure ? { failureCode: outcome.code, failureReason: outcome.reason, gatewayMessage: outcome.gatewayMessage } : {}),
      },
    });
    if (moved.count !== 1) return { result: "unchanged" as const };
    if (payment.status === target) return { result: "unchanged" as const };

    if (target === "PAID") {
      // Aceita encomendas pendentes, ou falhadas/canceladas por expiração cujo dinheiro chegou depois
      const from = order.status;
      if (from === "APPROVED") {
        await ownerLog("error", `Pagamento adicional confirmado para ${order.code}, já paga. Requer reembolso manual.`);
        return { result: "processed" as const, reason: "Encomenda já paga (pagamento em duplicado)" };
      }
      if (from === "REFUNDED") return { result: "ignored" as const, reason: "Encomenda reembolsada" };
      const fee = status.feeCents ?? 0;
      const upd = await tx.order.updateMany({
        where: { id: order.id, status: from },
        data: {
          status: "APPROVED",
          approvedAt: now,
          provider,
          externalRef: status.externalId ?? payment.externalId,
          paymentMethod: payment.method,
          feeCents: fee,
          netCents: order.totalCents - fee,
        },
      });
      if (upd.count !== 1) return { result: "unchanged" as const };
      if ((from === "DECLINED" || from === "CANCELED") && order.couponId) {
        await tx.coupon.update({ where: { id: order.couponId }, data: { usesCount: { increment: 1 } } });
      }
      await audit(tx, order.id, from, "APPROVED", actor, `Pagamento confirmado (${status.rawStatus})`);
      // Entrega: criada uma única vez (orderId é único)
      await tx.delivery.upsert({ where: { orderId: order.id }, create: { orderId: order.id, token: newDeliveryToken() }, update: {} });
      // Notificação de venda: na mesma transação (idempotente por pedido) — só existe se a encomenda foi aprovada aqui
      await recordOrderEvent(tx, "sale", order.id);
      return { result: "processed" as const, notified: true };
    }

    if (target === "FAILED" || target === "CANCELED" || target === "EXPIRED") {
      // A encomenda só falha se não houver outra tentativa ainda pendente ou paga
      const others = await tx.payment.count({ where: { orderId: order.id, id: { not: payment.id }, status: { in: ["CREATED", "PENDING", "PAID"] } } });
      if (others > 0 || order.status !== "PENDING") return { result: "processed" as const };
      const to: OrderStatus = target === "FAILED" ? "DECLINED" : "CANCELED";
      const upd = await tx.order.updateMany({
        where: { id: order.id, status: "PENDING" },
        data: { status: to, ...(to === "CANCELED" ? { canceledAt: now } : {}) },
      });
      if (upd.count === 1) {
        if (order.couponId) {
          await tx.$executeRaw`UPDATE "Coupon" SET "usesCount" = GREATEST("usesCount" - 1, 0) WHERE "id" = ${order.couponId}`;
        }
        await audit(tx, order.id, "PENDING", to, actor, `${outcome.reason ?? `Pagamento ${outcome.state}`} (${status.rawStatus})`);
        await recordOrderEvent(tx, "failed", order.id);
        return { result: "processed" as const, notified: true };
      }
      return { result: "processed" as const };
    }

    return { result: "processed" as const }; // pending: apenas atualização do pagamento
  });

  if (applied.result === "processed" && target === "PAID") await ownerLog("info", `Pagamento confirmado: ${order.code} (${source}).`);
  if (applied.result === "processed" && terminalFailure) await ownerLog("info", `Pagamento ${order.code} não concluído: ${outcome.reason ?? outcome.state} (${source}${outcome.gatewayMessage ? `; gateway: ${outcome.gatewayMessage}` : ""}).`);
  // Envio push depois da resposta; se falhar, a fila persistente volta a tentar
  if ("notified" in applied && applied.notified) await schedulePushDispatch();
  const { notified: _n, ...rest } = applied as typeof applied & { notified?: boolean };
  return { ...rest, orderId: order.id };
}
