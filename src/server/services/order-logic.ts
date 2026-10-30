import type { OrderStatus } from "@prisma/client";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendente",
  APPROVED: "Pago",
  DECLINED: "Falhou",
  REFUNDED: "Reembolsado",
  CANCELED: "Cancelado",
};

/**
 * Transições manuais permitidas a partir do painel.
 * Fora do modo de demonstração, aprovar e reembolsar exigem confirmação do processador de pagamentos
 * (eventos de webhook assinados), por isso não são permitidas manualmente.
 */
export function canTransition(from: OrderStatus, to: OrderStatus, ctx: { isDemo: boolean }): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: "O pedido já está nesse estado." };
  if (to === "CANCELED") {
    return from === "PENDING" ? { ok: true } : { ok: false, reason: "Só pedidos pendentes podem ser cancelados." };
  }
  if (!ctx.isDemo) {
    return { ok: false, reason: "Esta alteração requer confirmação do processador de pagamentos (ainda não integrado)." };
  }
  if (to === "APPROVED" && from === "PENDING") return { ok: true };
  if (to === "DECLINED" && from === "PENDING") return { ok: true };
  if (to === "REFUNDED" && from === "APPROVED") return { ok: true };
  return { ok: false, reason: "Transição de estado inválida." };
}

export function computeOrderTotals(items: { unitPriceCents: number; quantity: number }[], discountCents: number, feeCents = 0) {
  const subtotalCents = items.reduce((acc, i) => acc + i.unitPriceCents * i.quantity, 0);
  const discount = Math.max(0, Math.min(discountCents, subtotalCents));
  const totalCents = subtotalCents - discount;
  return { subtotalCents, discountCents: discount, totalCents, feeCents, netCents: totalCents - feeCents };
}
