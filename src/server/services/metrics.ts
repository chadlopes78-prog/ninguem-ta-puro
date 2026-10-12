import { prisma } from "@/server/db";
import type { DateRange } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { EVENT_TYPES } from "./analytics";
import {
  computeKpis,
  currenciesIn,
  dailySeries,
  offerItemBreakdown,
  productPerformance,
  statusDistribution,
  type MetricOrder,
} from "./metrics-logic";

async function loadOrders(isDemo: boolean, from: Date, to: Date): Promise<MetricOrder[]> {
  const rows = await prisma.order.findMany({
    where: { isDemo, createdAt: { gte: from, lt: to } },
    select: {
      status: true,
      currency: true,
      totalCents: true,
      feeCents: true,
      createdAt: true,
      checkoutId: true,
      items: { select: { productId: true, totalCents: true, kind: true, product: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    ...r,
    items: r.items.map((i) => ({ productId: i.productId, productName: i.product.name, totalCents: i.totalCents, kind: i.kind })),
  }));
}

async function countSessions(isDemo: boolean, from: Date, to: Date) {
  return prisma.checkoutSession.count({ where: { isDemo, createdAt: { gte: from, lt: to } } });
}

export async function getDashboardData(params: { isDemo: boolean; range: DateRange; currency?: CurrencyCode; defaultCurrency: CurrencyCode; tz: string }) {
  const { isDemo, range, tz } = params;
  const [orders, prevOrders, sessions, prevSessions] = await Promise.all([
    loadOrders(isDemo, range.from, range.to),
    loadOrders(isDemo, range.previous.from, range.previous.to),
    countSessions(isDemo, range.from, range.to),
    countSessions(isDemo, range.previous.from, range.previous.to),
  ]);
  const currencies = currenciesIn([...orders, ...prevOrders]);
  const currency = params.currency && currencies.includes(params.currency) ? params.currency : currencies.includes(params.defaultCurrency) || !currencies.length ? params.defaultCurrency : currencies[0];

  const prevDays = range.days.map((_, i) => i); // índices alinhados para comparação
  const prevSeries = dailySeries(prevOrders, currency, shiftDays(range.days, range.days.length), tz);

  const recent = await prisma.order.findMany({
    where: { isDemo },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { customer: { select: { name: true, email: true } }, items: { take: 1, select: { product: { select: { name: true } } } } },
  });

  return {
    currency,
    currencies,
    kpis: computeKpis(orders, currency, sessions),
    previousKpis: computeKpis(prevOrders, currency, prevSessions),
    series: dailySeries(orders, currency, range.days, tz).map((p, i) => ({
      ...p,
      prevRevenueCents: prevSeries[prevDays[i]]?.revenueCents ?? 0,
    })),
    products: productPerformance(orders, currency).slice(0, 8),
    statuses: statusDistribution(orders, currency),
    recent,
    hasAnyOrder: (await prisma.order.count({ where: { isDemo } })) > 0,
  };
}

function shiftDays(days: string[], by: number): string[] {
  return days.map((d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd - by)).toISOString().slice(0, 10);
  });
}

export async function getReportsData(params: { isDemo: boolean; range: DateRange; currency?: CurrencyCode; defaultCurrency: CurrencyCode; tz: string }) {
  const { isDemo, range } = params;
  const base = await getDashboardData(params);
  const orders = await loadOrders(isDemo, range.from, range.to);

  const checkouts = await prisma.checkout.findMany({
    where: { isDemo },
    select: {
      id: true,
      name: true,
      offer: { select: { currency: true } },
      _count: { select: { sessions: { where: { createdAt: { gte: range.from, lt: range.to } } } } },
    },
  });
  const approvedByCheckout = await prisma.order.groupBy({
    by: ["checkoutId"],
    where: { isDemo, status: "APPROVED", currency: base.currency, createdAt: { gte: range.from, lt: range.to }, checkoutId: { not: null } },
    _count: { _all: true },
    _sum: { totalCents: true },
  });
  const submits = await prisma.analyticsEvent.groupBy({
    by: ["checkoutId"],
    where: { isDemo, type: EVENT_TYPES.CHECKOUT_SUBMIT, createdAt: { gte: range.from, lt: range.to } },
    _count: { _all: true },
  });
  const checkoutRows = checkouts.map((c) => {
    const a = approvedByCheckout.find((x) => x.checkoutId === c.id);
    const sessions = c._count.sessions;
    const approved = a?._count._all ?? 0;
    return {
      id: c.id,
      name: c.name,
      sessions,
      submits: submits.find((s) => s.checkoutId === c.id)?._count._all ?? 0,
      approved,
      revenueCents: a?._sum.totalCents ?? 0,
      conversion: sessions > 0 ? Math.round((approved / sessions) * 10000) / 100 : null,
    };
  });

  const funnels = await prisma.funnel.findMany({ where: { isDemo }, select: { id: true, name: true, status: true } });
  const offerEvents = await prisma.analyticsEvent.groupBy({
    by: ["funnelId", "type"],
    where: {
      isDemo,
      type: { in: [EVENT_TYPES.FUNNEL_STEP_VIEW, EVENT_TYPES.OFFER_ACCEPT, EVENT_TYPES.OFFER_DECLINE] },
      createdAt: { gte: range.from, lt: range.to },
    },
    _count: { _all: true },
  });
  const funnelRows = funnels.map((f) => {
    const get = (t: string) => offerEvents.find((e) => e.funnelId === f.id && e.type === t)?._count._all ?? 0;
    const accepts = get(EVENT_TYPES.OFFER_ACCEPT);
    const declines = get(EVENT_TYPES.OFFER_DECLINE);
    return {
      ...f,
      views: get(EVENT_TYPES.FUNNEL_STEP_VIEW),
      accepts,
      declines,
      acceptRate: accepts + declines > 0 ? Math.round((accepts / (accepts + declines)) * 1000) / 10 : null,
    };
  });

  return { ...base, checkoutRows, funnelRows, offerItems: offerItemBreakdown(orders, base.currency) };
}
