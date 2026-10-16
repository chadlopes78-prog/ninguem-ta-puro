// Atividades do dia no Dashboard (funções puras). O "dia de hoje" é calculado no fuso da conta
// (ex.: Africa/Maputo, UTC+2) e cada atividade usa a data real do evento (criação, confirmação do
// pagamento, cancelamento ou reembolso do pedido), nunca a data de outra entidade relacionada.
import type { OrderStatus } from "@prisma/client";
import { addDays, startOfZonedDay, zonedDayKey } from "./dates";

/** [início, fim) do dia atual no fuso `tz`, em instantes UTC. */
export function zonedTodayBounds(tz: string, now: Date = new Date()): { dayKey: string; from: Date; to: Date } {
  const dayKey = zonedDayKey(now, tz);
  return { dayKey, from: startOfZonedDay(dayKey, tz), to: startOfZonedDay(addDays(dayKey, 1), tz) };
}

export type ActivityKind = "created" | "approved" | "canceled" | "refunded";
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  created: "Novo pedido",
  approved: "Pagamento confirmado",
  canceled: "Pedido cancelado",
  refunded: "Pedido reembolsado",
};

export interface ActivityOrder {
  id: string;
  code: string;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: Date;
  approvedAt: Date | null;
  canceledAt: Date | null;
  refundedAt: Date | null;
  customerName: string;
  productName: string | null;
}

export interface Activity extends Omit<ActivityOrder, "createdAt" | "approvedAt" | "canceledAt" | "refundedAt"> {
  key: string;
  kind: ActivityKind;
  at: Date;
}

/** Eventos dos pedidos que aconteceram dentro de [from, to), do mais recente para o mais antigo. */
export function buildActivities(orders: ActivityOrder[], from: Date, to: Date, limit = 10): Activity[] {
  const out: Activity[] = [];
  for (const o of orders) {
    const { createdAt, approvedAt, canceledAt, refundedAt, ...rest } = o;
    const events: [ActivityKind, Date | null][] = [
      ["created", createdAt],
      ["approved", approvedAt],
      ["canceled", canceledAt],
      ["refunded", refundedAt],
    ];
    for (const [kind, at] of events) {
      if (at && at >= from && at < to) out.push({ ...rest, key: `${o.id}:${kind}`, kind, at });
    }
  }
  const rank: Record<ActivityKind, number> = { created: 0, approved: 1, canceled: 2, refunded: 3 };
  // mais recente primeiro; no mesmo instante, o evento posterior no ciclo do pedido primeiro
  out.sort((a, b) => b.at.getTime() - a.at.getTime() || rank[b.kind] - rank[a.kind]);
  return out.slice(0, limit);
}
