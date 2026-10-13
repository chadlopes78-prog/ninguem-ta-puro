import { prisma } from "@/server/db";
import type { DateRange } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { EVENT_TYPES } from "./analytics";
import { own, type Scope } from "@/server/scope";
import {
  computeKpis,
  currenciesIn,
  dailySeries,
  offerItemBreakdown,
  productPerformance,
  statusDistribution,
  type MetricOrder,
} from "./metrics-logic";

async function loadOrders(scope: Scope, from: Date, to: Date): Promise<MetricOrder[]> {
  const rows = await prisma.order.findMany({
    // pagamentos feitos com credenciais de teste do processador nunca contam como receita
    where: { ...own(scope), isTestPayment: false, createdAt: { gte: from, lt: to } },
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

async function countSessions(scope: Scope, from: Date, to: Date) {
  return prisma.checkoutSession.count({ where: { ...own(scope), createdAt: { gte: from, lt: to } } });
}

type MetricsParams = { scope: Scope; range: DateRange; currency?: CurrencyCode; defaultCurrency: CurrencyCode; tz: string };

// Todas as leituras são independentes e correm em paralelo: em produção cada ida à base de dados
// custa a latência entre a Vercel e a BD, por isso consultas em sequência somam-se.
async function dashboardCore(params: MetricsParams) {
  const { scope, range, tz } = params;
  const [orders, prevOrders, sessions, prevSessions, recent, anyOrder] = await Promise.all([
    loadOrders(scope, range.from, range.to),
    loadOrders(scope, range.previous.from, range.previous.to),
    countSessions(scope, range.from, range.to),
    countSessions(scope, range.previous.from, range.previous.to),
    prisma.order.findMany({
      where: own(scope),
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { customer: { select: { name: true, email: true } }, items: { take: 1, select: { product: { select: { name: true } } } } },
    }),
    prisma.order.findFirst({ where: own(scope), select: { id: true } }),
  ]);
  const currencies = currenciesIn([...orders, ...prevOrders]);
  const currency = params.currency && currencies.includes(params.currency) ? params.currency : currencies.includes(params.defaultCurrency) || !currencies.length ? params.defaultCurrency : currencies[0];

  const prevDays = range.days.map((_, i) => i); // índices alinhados para comparação
  const prevSeries = dailySeries(prevOrders, currency, shiftDays(range.days, range.days.length), tz);

  const data = {
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
    hasAnyOrder: anyOrder !== null,
  };
  return { data, orders };
}

export async function getDashboardData(params: MetricsParams) {
  return (await dashboardCore(params)).data;
}

function shiftDays(days: string[], by: number): string[] {
  return days.map((d) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, dd - by)).toISOString().slice(0, 10);
  });
}

export async function getReportsData(params: MetricsParams) {
  const { scope, range } = params;
  const [core, checkouts, approvedRows, submits, funnels, offerEvents] = await Promise.all([
    dashboardCore(params),
    prisma.checkout.findMany({
      where: own(scope),
      select: {
        id: true,
        name: true,
        offer: { select: { currency: true } },
        _count: { select: { sessions: { where: { createdAt: { gte: range.from, lt: range.to } } } } },
      },
    }),
    // agrupado também por moeda: a moeda do relatório só é conhecida depois de ler as encomendas
    prisma.order.groupBy({
      by: ["checkoutId", "currency"],
      where: { ...own(scope), isTestPayment: false, status: "APPROVED", createdAt: { gte: range.from, lt: range.to }, checkoutId: { not: null } },
      _count: { _all: true },
      _sum: { totalCents: true },
    }),
    prisma.analyticsEvent.groupBy({
      by: ["checkoutId"],
      where: { ...own(scope), type: EVENT_TYPES.CHECKOUT_SUBMIT, createdAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
    }),
    prisma.funnel.findMany({ where: own(scope), select: { id: true, name: true, status: true } }),
    prisma.analyticsEvent.groupBy({
      by: ["funnelId", "type"],
      where: {
        ...own(scope),
        type: { in: [EVENT_TYPES.FUNNEL_STEP_VIEW, EVENT_TYPES.OFFER_ACCEPT, EVENT_TYPES.OFFER_DECLINE] },
        createdAt: { gte: range.from, lt: range.to },
      },
      _count: { _all: true },
    }),
  ]);
  const base = core.data;
  const orders = core.orders;
  const approvedByCheckout = approvedRows.filter((r) => r.currency === base.currency);
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
