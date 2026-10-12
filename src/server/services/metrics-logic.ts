// Cálculo de métricas a partir de pedidos persistidos (funções puras, testáveis).
//
// Regras documentadas:
// - Faturação bruta: soma de `totalCents` dos pedidos APROVADOS criados no período (já com descontos).
//   Pedidos pendentes, recusados, cancelados e reembolsados NÃO entram.
// - Pedidos aprovados: contagem de pedidos com estado APROVADO.
// - Ticket médio: faturação bruta / pedidos aprovados (mesma moeda).
// - Reembolsos: apresentados à parte (contagem e valor). Um pedido reembolsado deixa de estar aprovado,
//   portanto já não está incluído na faturação bruta — não é subtraído duas vezes.
// - Valor líquido estimado: faturação bruta − taxas efetivamente registadas nesses pedidos.
//   Nenhum custo é inventado: sem processador, as taxas registadas são 0.
// - Conversão do checkout: pedidos aprovados com checkout de origem / sessões de checkout × 100.
//   Só é calculada quando existem sessões registadas no período.
// - Moedas: nunca são somadas entre si; as métricas são calculadas por moeda.

import type { OrderStatus } from "@prisma/client";
import type { CurrencyCode } from "@/lib/money";
import { zonedDayKey } from "@/lib/dates";

export interface MetricOrder {
  status: OrderStatus;
  currency: CurrencyCode;
  totalCents: number;
  feeCents: number;
  createdAt: Date;
  checkoutId: string | null;
  items: { productId: string; productName: string; totalCents: number; kind: string }[];
}

export interface Kpis {
  grossCents: number;
  approvedCount: number;
  totalOrders: number;
  avgTicketCents: number | null;
  refundCount: number;
  refundCents: number;
  pendingCount: number;
  pendingCents: number;
  feeCents: number;
  netCents: number;
  conversionRate: number | null;
  checkoutSessions: number;
}

export function computeKpis(orders: MetricOrder[], currency: CurrencyCode, checkoutSessions: number): Kpis {
  const inCurrency = orders.filter((o) => o.currency === currency);
  const approved = inCurrency.filter((o) => o.status === "APPROVED");
  const refunded = inCurrency.filter((o) => o.status === "REFUNDED");
  const pending = inCurrency.filter((o) => o.status === "PENDING");
  const grossCents = approved.reduce((a, o) => a + o.totalCents, 0);
  const feeCents = approved.reduce((a, o) => a + o.feeCents, 0);
  const attributable = approved.filter((o) => o.checkoutId).length;
  return {
    grossCents,
    approvedCount: approved.length,
    totalOrders: inCurrency.length,
    avgTicketCents: approved.length ? Math.round(grossCents / approved.length) : null,
    refundCount: refunded.length,
    refundCents: refunded.reduce((a, o) => a + o.totalCents, 0),
    pendingCount: pending.length,
    pendingCents: pending.reduce((a, o) => a + o.totalCents, 0),
    feeCents,
    netCents: grossCents - feeCents,
    conversionRate: checkoutSessions > 0 ? Math.round((attributable / checkoutSessions) * 10000) / 100 : null,
    checkoutSessions,
  };
}

export interface DailyPoint {
  day: string;
  revenueCents: number;
  orders: number;
  approved: number;
}

export function dailySeries(orders: MetricOrder[], currency: CurrencyCode, days: string[], tz: string): DailyPoint[] {
  const map = new Map<string, DailyPoint>(days.map((d) => [d, { day: d, revenueCents: 0, orders: 0, approved: 0 }]));
  for (const o of orders) {
    if (o.currency !== currency) continue;
    const p = map.get(zonedDayKey(o.createdAt, tz));
    if (!p) continue;
    p.orders++;
    if (o.status === "APPROVED") {
      p.approved++;
      p.revenueCents += o.totalCents;
    }
  }
  return [...map.values()];
}

export function productPerformance(orders: MetricOrder[], currency: CurrencyCode) {
  const map = new Map<string, { productId: string; name: string; revenueCents: number; units: number }>();
  for (const o of orders) {
    if (o.currency !== currency || o.status !== "APPROVED") continue;
    for (const it of o.items) {
      const cur = map.get(it.productId) ?? { productId: it.productId, name: it.productName, revenueCents: 0, units: 0 };
      cur.revenueCents += it.totalCents;
      cur.units += 1;
      map.set(it.productId, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

export function statusDistribution(orders: MetricOrder[], currency: CurrencyCode) {
  const statuses: OrderStatus[] = ["APPROVED", "PENDING", "DECLINED", "REFUNDED", "CANCELED"];
  return statuses.map((s) => ({ status: s, count: orders.filter((o) => o.currency === currency && o.status === s).length }));
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function currenciesIn(orders: MetricOrder[]): CurrencyCode[] {
  return [...new Set(orders.map((o) => o.currency))];
}

/** Desempenho de itens adicionais (upsell/downsell/oferta adicional) aprovados. */
export function offerItemBreakdown(orders: MetricOrder[], currency: CurrencyCode) {
  const kinds = ["MAIN", "ORDER_BUMP", "UPSELL", "DOWNSELL"] as const;
  return kinds.map((kind) => {
    const items = orders
      .filter((o) => o.currency === currency && o.status === "APPROVED")
      .flatMap((o) => o.items.filter((i) => i.kind === kind));
    return { kind, count: items.length, revenueCents: items.reduce((a, i) => a + i.totalCents, 0) };
  });
}
