// Relatórios de faturamento, tabela de transações, exportação CSV e registo de reembolsos.
// As regras de cálculo estão em finance-logic.ts (funções puras).
import "server-only";
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { DateRange } from "@/lib/dates";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import { audit } from "@/server/payments/confirm";
import { recordRefundEvent } from "@/server/notifications/events";
import { schedulePushDispatch } from "@/server/notifications/push";
import { DomainError, NotFoundError } from "./products";
import {
  financeCurrencies,
  financeDaily,
  financeKpis,
  refundCheck,
  salesByGateway,
  salesByProduct,
  type FinanceOrder,
  type FinanceRefund,
} from "./finance-logic";

/** Pedidos com movimento na janela (criados ou confirmados) e reembolsos registados na janela. */
export async function loadFinanceData(p: { isDemo: boolean; from: Date; to: Date }): Promise<{ orders: FinanceOrder[]; refunds: FinanceRefund[]; currencies: CurrencyCode[] }> {
  const span = { gte: p.from, lt: p.to };
  const [rows, refundRows] = await Promise.all([
    prisma.order.findMany({
      // pagamentos com credenciais de teste do gateway nunca contam como receita
      where: { isDemo: p.isDemo, isTestPayment: false, OR: [{ createdAt: span }, { approvedAt: span }] },
      select: {
        id: true,
        status: true,
        currency: true,
        totalCents: true,
        feeCents: true,
        createdAt: true,
        approvedAt: true,
        provider: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true } },
        items: { select: { productId: true, totalCents: true, product: { select: { name: true } } } },
      },
    }),
    prisma.refund.findMany({ where: { isDemo: p.isDemo, createdAt: span, order: { isTestPayment: false } }, select: { orderId: true, amountCents: true, currency: true, createdAt: true } }),
  ]);
  const orders: FinanceOrder[] = rows.map((r) => ({
    id: r.id,
    status: r.status,
    currency: r.currency,
    totalCents: r.totalCents,
    feeCents: r.feeCents,
    createdAt: r.createdAt,
    approvedAt: r.approvedAt,
    gateway: r.provider ?? r.payments[0]?.provider ?? null,
    items: r.items.map((i) => ({ productId: i.productId, productName: i.product.name, totalCents: i.totalCents })),
  }));
  const refunds = refundRows.map((r) => ({ ...r, currency: r.currency as CurrencyCode }));
  return { orders, refunds, currencies: financeCurrencies(orders, refunds) };
}

export async function getFinanceReport(p: { isDemo: boolean; range: DateRange; currency?: CurrencyCode; defaultCurrency: CurrencyCode; tz: string }) {
  const { range, tz } = p;
  const [cur, prev] = await Promise.all([loadFinanceData({ isDemo: p.isDemo, from: range.from, to: range.to }), loadFinanceData({ isDemo: p.isDemo, from: range.previous.from, to: range.previous.to })]);
  const currencies = cur.currencies.length ? cur.currencies : [p.defaultCurrency];
  const currency = p.currency && CURRENCIES.includes(p.currency) ? p.currency : currencies.includes(p.defaultCurrency) ? p.defaultCurrency : currencies[0];
  const w = { from: range.from, to: range.to };
  return {
    currency,
    currencies,
    kpis: financeKpis(cur.orders, cur.refunds, currency, w),
    previousKpis: financeKpis(prev.orders, prev.refunds, currency, range.previous),
    daily: financeDaily(cur.orders, cur.refunds, currency, range.days, tz),
    products: salesByProduct(cur.orders, currency, w),
    gateways: salesByGateway(cur.orders, currency, w),
  };
}

// ───────────── Transações ─────────────

export const TX_SORTS = ["date", "amount"] as const;
export type TxSort = (typeof TX_SORTS)[number];

export interface TxFilters {
  q?: string;
  status?: OrderStatus;
  gateway?: string;
  productId?: string;
  currency?: CurrencyCode;
  sort?: TxSort;
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

function txWhere(isDemo: boolean, range: { from: Date; to: Date }, f: TxFilters): Prisma.OrderWhereInput {
  const span = { gte: range.from, lt: range.to };
  const and: Prisma.OrderWhereInput[] = [{ OR: [{ createdAt: span }, { approvedAt: span }, { refunds: { some: { createdAt: span } } }] }];
  if (f.status) and.push({ status: f.status });
  if (f.currency) and.push({ currency: f.currency });
  if (f.productId) and.push({ items: { some: { productId: f.productId } } });
  if (f.gateway) and.push(f.gateway === "sem-gateway" ? { provider: null, payments: { none: {} } } : { OR: [{ provider: f.gateway }, { provider: null, payments: { some: { provider: f.gateway } } }] });
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    and.push({
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { externalRef: { contains: q, mode: "insensitive" } },
        { payments: { some: { externalId: { contains: q, mode: "insensitive" } } } },
        { customer: { email: { contains: q, mode: "insensitive" } } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
        { items: { some: { product: { name: { contains: q, mode: "insensitive" } } } } },
      ],
    });
  }
  return { isDemo, AND: and };
}

export async function listTransactions(isDemo: boolean, range: { from: Date; to: Date }, f: TxFilters) {
  const pageSize = Math.min(Math.max(f.pageSize ?? 20, 1), 5000);
  const page = Math.max(1, f.page ?? 1);
  const where = txWhere(isDemo, range, f);
  const dir = f.dir === "asc" ? "asc" : "desc";
  const orderBy: Prisma.OrderOrderByWithRelationInput[] = f.sort === "amount" ? [{ totalCents: dir }, { createdAt: "desc" }] : [{ createdAt: dir }];
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        code: true,
        status: true,
        currency: true,
        totalCents: true,
        createdAt: true,
        approvedAt: true,
        provider: true,
        externalRef: true,
        isTestPayment: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { provider: true, externalId: true } },
        items: { select: { product: { select: { name: true } } } },
        refunds: { select: { amountCents: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    rows: rows.map((r) => {
      const refunded = r.refunds.reduce((a, x) => a + x.amountCents, 0);
      return {
        id: r.id,
        code: r.code,
        date: r.createdAt,
        approvedAt: r.approvedAt,
        products: [...new Set(r.items.map((i) => i.product.name))].join(", "),
        totalCents: r.totalCents,
        currency: r.currency as CurrencyCode,
        status: r.status,
        gateway: r.provider ?? r.payments[0]?.provider ?? null,
        reference: r.externalRef ?? r.payments[0]?.externalId ?? null,
        isTestPayment: r.isTestPayment,
        refundedCents: refunded,
        refundState: refunded === 0 ? ("none" as const) : refunded >= r.totalCents ? ("full" as const) : ("partial" as const),
      };
    }),
  };
}

export async function transactionFilterOptions(isDemo: boolean) {
  const [products, gateways] = await Promise.all([
    prisma.product.findMany({ where: { isDemo }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 200 }),
    prisma.payment.groupBy({ by: ["provider"], where: { order: { isDemo } } }),
  ]);
  return { products, gateways: gateways.map((g) => g.provider) };
}

/** Célula CSV segura: aspas escapadas e neutralização de fórmulas (=, +, -, @) ao abrir em folhas de cálculo. */
export function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ───────────── Reembolsos ─────────────

/**
 * Regista um reembolso (parcial ou total) de um pedido pago. A plataforma não movimenta dinheiro: em pedidos reais
 * regista o reembolso já efetuado no painel do gateway; em demonstração é simulado.
 * Soma dos reembolsos ≤ total do pedido; com o total atingido o pedido passa a REEMBOLSADO.
 */
export async function recordRefund(input: { orderId: string; amountCents: number; reason?: string; confirmedAtGateway: boolean }, isDemo: boolean, actor: string) {
  const order = await prisma.order.findFirst({ where: { id: input.orderId, isDemo }, select: { id: true, code: true, status: true, totalCents: true, approvedAt: true, currency: true } });
  if (!order) throw new NotFoundError("Pedido");
  if (!isDemo && !input.confirmedAtGateway) throw new DomainError("Confirme que o reembolso já foi feito no painel do gateway.");
  const result = await prisma.$transaction(async (tx) => {
    // Bloqueio da linha do pedido: dois reembolsos em simultâneo não ultrapassam o total
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
    const fresh = await tx.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true, totalCents: true, approvedAt: true } });
    const done = await tx.refund.aggregate({ where: { orderId: order.id }, _sum: { amountCents: true } });
    const check = refundCheck(fresh, done._sum.amountCents ?? 0, input.amountCents);
    if (!check.ok) throw new DomainError(check.reason);
    const refund = await tx.refund.create({
      data: { orderId: order.id, amountCents: input.amountCents, currency: order.currency, reason: input.reason?.trim().slice(0, 300) || null, actor, isDemo },
    });
    if (check.full) {
      await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED", refundedAt: new Date() } });
      await audit(tx, order.id, "APPROVED", "REFUNDED", actor, isDemo ? "Reembolso total (demonstração)" : "Reembolso total registado (efetuado no gateway)");
    } else {
      await audit(tx, order.id, "APPROVED", "APPROVED", actor, `Reembolso parcial registado: ${input.amountCents} cêntimos`);
    }
    const notified = isDemo ? 0 : await recordRefundEvent(tx, { id: refund.id, orderId: order.id, amountCents: refund.amountCents, currency: order.currency as CurrencyCode, full: check.full }, order.code);
    return { refund, full: check.full, notified };
  });
  if (result.notified) await schedulePushDispatch();
  return result;
}
