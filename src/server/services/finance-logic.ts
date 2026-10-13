// Modelo financeiro dos relatórios e do resumo diário (funções puras, testáveis).
//
// Regras (documentadas também no PROJECT_STATUS.md e na página Relatórios):
// - Venda confirmada: pedido cujo pagamento foi confirmado pelo servidor (approvedAt preenchido) e que está
//   APROVADO ou foi depois REEMBOLSADO. Conta no dia da confirmação (approvedAt), no fuso da plataforma.
//   Um pedido conta uma única vez, mesmo que o gateway envie vários eventos de confirmação (o pedido só muda
//   de estado uma vez; somamos pedidos, nunca eventos ou tentativas de pagamento).
// - Faturamento bruto: soma de `totalCents` das vendas confirmadas (já com descontos).
// - Reembolsos: soma dos registos de reembolso (parciais ou totais) na data em que foram registados.
// - Faturamento após reembolsos: bruto − reembolsos do mesmo período. NÃO é lucro nem saldo disponível:
//   não inclui comissões dos gateways não reportadas, impostos ou outros custos.
// - Taxas registadas: apenas as devolvidas pelo gateway (feeCents); nunca estimadas.
// - Pendentes: pedidos PENDENTES criados no período (não entram no faturamento).
// - Falhados: pedidos RECUSADOS criados no período; cancelados/expirados contam à parte. Não entram no faturamento.
// - Moedas: nunca são somadas entre si; tudo é calculado para uma moeda de cada vez.
// - Pagamentos de teste (credenciais sandbox) e dados de demonstração ficam fora (filtrados na consulta).

import type { OrderStatus } from "@prisma/client";
import type { CurrencyCode } from "@/lib/money";
import { zonedDayKey } from "@/lib/dates";

export interface FinanceOrder {
  id: string;
  status: OrderStatus;
  currency: CurrencyCode;
  totalCents: number;
  feeCents: number;
  createdAt: Date;
  approvedAt: Date | null;
  /** Gateway que confirmou (ou o da última tentativa de pagamento) */
  gateway: string | null;
  items: { productId: string; productName: string; totalCents: number }[];
}

export interface FinanceRefund {
  orderId: string;
  amountCents: number;
  currency: CurrencyCode;
  createdAt: Date;
}

export interface Window {
  from: Date;
  to: Date;
}

const inWindow = (d: Date | null, w: Window) => d !== null && d >= w.from && d < w.to;

export function isConfirmedSale(o: Pick<FinanceOrder, "status" | "approvedAt">): boolean {
  return o.approvedAt !== null && (o.status === "APPROVED" || o.status === "REFUNDED");
}

export interface FinanceKpis {
  grossCents: number;
  salesCount: number;
  avgTicketCents: number | null;
  refundCents: number;
  refundCount: number;
  netAfterRefundsCents: number;
  feeCents: number;
  pendingCount: number;
  pendingCents: number;
  failedCount: number;
  failedCents: number;
  canceledCount: number;
}

export function financeKpis(orders: FinanceOrder[], refunds: FinanceRefund[], currency: CurrencyCode, w: Window): FinanceKpis {
  const cur = orders.filter((o) => o.currency === currency);
  const sales = cur.filter((o) => isConfirmedSale(o) && inWindow(o.approvedAt, w));
  const created = cur.filter((o) => inWindow(o.createdAt, w));
  const pending = created.filter((o) => o.status === "PENDING");
  const failed = created.filter((o) => o.status === "DECLINED");
  const refs = refunds.filter((r) => r.currency === currency && inWindow(r.createdAt, w));
  const grossCents = sum(sales.map((o) => o.totalCents));
  const refundCents = sum(refs.map((r) => r.amountCents));
  return {
    grossCents,
    salesCount: sales.length,
    avgTicketCents: sales.length ? Math.round(grossCents / sales.length) : null,
    refundCents,
    refundCount: refs.length,
    netAfterRefundsCents: grossCents - refundCents,
    feeCents: sum(sales.map((o) => o.feeCents)),
    pendingCount: pending.length,
    pendingCents: sum(pending.map((o) => o.totalCents)),
    failedCount: failed.length,
    failedCents: sum(failed.map((o) => o.totalCents)),
    canceledCount: created.filter((o) => o.status === "CANCELED").length,
  };
}

export interface FinanceDay {
  day: string;
  grossCents: number;
  sales: number;
  refundCents: number;
  refunds: number;
}

export function financeDaily(orders: FinanceOrder[], refunds: FinanceRefund[], currency: CurrencyCode, days: string[], tz: string): FinanceDay[] {
  const map = new Map<string, FinanceDay>(days.map((d) => [d, { day: d, grossCents: 0, sales: 0, refundCents: 0, refunds: 0 }]));
  for (const o of orders) {
    if (o.currency !== currency || !isConfirmedSale(o)) continue;
    const p = map.get(zonedDayKey(o.approvedAt!, tz));
    if (!p) continue;
    p.sales++;
    p.grossCents += o.totalCents;
  }
  for (const r of refunds) {
    if (r.currency !== currency) continue;
    const p = map.get(zonedDayKey(r.createdAt, tz));
    if (!p) continue;
    p.refunds++;
    p.refundCents += r.amountCents;
  }
  return [...map.values()];
}

export function salesByProduct(orders: FinanceOrder[], currency: CurrencyCode, w: Window) {
  const map = new Map<string, { productId: string; name: string; revenueCents: number; units: number }>();
  for (const o of orders) {
    if (o.currency !== currency || !isConfirmedSale(o) || !inWindow(o.approvedAt, w)) continue;
    for (const it of o.items) {
      const cur = map.get(it.productId) ?? { productId: it.productId, name: it.productName, revenueCents: 0, units: 0 };
      cur.revenueCents += it.totalCents;
      cur.units += 1;
      map.set(it.productId, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents || b.units - a.units);
}

export function salesByGateway(orders: FinanceOrder[], currency: CurrencyCode, w: Window) {
  const map = new Map<string, { gateway: string; revenueCents: number; sales: number }>();
  for (const o of orders) {
    if (o.currency !== currency || !isConfirmedSale(o) || !inWindow(o.approvedAt, w)) continue;
    const g = o.gateway ?? "sem-gateway";
    const cur = map.get(g) ?? { gateway: g, revenueCents: 0, sales: 0 };
    cur.revenueCents += o.totalCents;
    cur.sales++;
    map.set(g, cur);
  }
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}

/** Moedas com movimento (vendas, pedidos ou reembolsos) — nunca somadas entre si. */
export function financeCurrencies(orders: FinanceOrder[], refunds: FinanceRefund[]): CurrencyCode[] {
  return [...new Set([...orders.map((o) => o.currency), ...refunds.map((r) => r.currency)])];
}

/** Reembolso permitido? Soma dos reembolsos nunca excede o total pago. */
export function refundCheck(order: { status: OrderStatus; totalCents: number; approvedAt: Date | null }, alreadyRefundedCents: number, amountCents: number): { ok: true; full: boolean } | { ok: false; reason: string } {
  if (order.status !== "APPROVED" || !order.approvedAt) return { ok: false, reason: "Só pedidos pagos (com pagamento confirmado) podem ser reembolsados." };
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return { ok: false, reason: "Indique um valor de reembolso válido." };
  const remaining = order.totalCents - alreadyRefundedCents;
  if (amountCents > remaining) return { ok: false, reason: `O valor excede o que falta reembolsar (${(remaining / 100).toFixed(2).replace(".", ",")}).` };
  return { ok: true, full: amountCents === remaining };
}

export const GATEWAY_LABELS: Record<string, string> = {
  epay: "EPay",
  e2payments: "E2Payments",
  "teste-local": "Fornecedor de teste",
  "sem-gateway": "Sem gateway (manual/demonstração)",
};

export function gatewayLabel(id: string | null | undefined): string {
  if (!id) return GATEWAY_LABELS["sem-gateway"];
  return GATEWAY_LABELS[id] ?? id;
}

function sum(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0);
}
