// Dashboard: atividades de hoje e metas de faturamento. Só leitura de pedidos (nunca altera vendas).
import "server-only";
import { prisma } from "@/server/db";
import { own, type Scope } from "@/server/scope";
import { buildActivities, zonedTodayBounds } from "@/lib/activity";
import { REVENUE_GOALS, goalProgress, goalsToCelebrate } from "@/lib/revenue-goals";

/** Atividades dos pedidos da conta que aconteceram hoje (no fuso `tz`), mais recentes primeiro. */
export async function getTodayActivity(scope: Scope, tz: string, now: Date = new Date(), limit = 10) {
  const { dayKey, from, to } = zonedTodayBounds(tz, now);
  const inToday = { gte: from, lt: to };
  const rows = await prisma.order.findMany({
    where: { ...own(scope), OR: [{ createdAt: inToday }, { approvedAt: inToday }, { canceledAt: inToday }, { refundedAt: inToday }] },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      code: true,
      status: true,
      totalCents: true,
      currency: true,
      createdAt: true,
      approvedAt: true,
      canceledAt: true,
      refundedAt: true,
      customer: { select: { name: true } },
      items: { take: 1, select: { product: { select: { name: true } } } },
    },
  });
  const orders = rows.map(({ customer, items, ...o }) => ({ ...o, customerName: customer.name, productName: items[0]?.product.name ?? null }));
  return { dayKey, activities: buildActivities(orders, from, to, limit) };
}

/**
 * Faturamento acumulado para as metas: a mesma definição da «Faturação bruta» do Dashboard
 * (soma de `totalCents` dos pedidos APROVADOS, sem pagamentos de teste), sem limite de datas, em MZN.
 * Pendentes, recusados, cancelados e reembolsados não contam; cada pedido conta uma única vez.
 */
export async function lifetimeRevenueCents(scope: Scope): Promise<number> {
  const r = await prisma.order.aggregate({
    where: { ...own(scope), isTestPayment: false, status: "APPROVED", currency: "MZN" },
    _sum: { totalCents: true },
  });
  return r._sum.totalCents ?? 0;
}

export async function getRevenueGoalState(scope: Scope) {
  const [revenueCents, celebrated] = await Promise.all([
    lifetimeRevenueCents(scope),
    // no modo de demonstração não há celebrações (os dados são fictícios)
    scope.isDemo ? Promise.resolve([]) : prisma.revenueMilestone.findMany({ where: { userId: scope.ownerId }, select: { amountCents: true } }),
  ]);
  const progress = goalProgress(revenueCents);
  const toCelebrate = scope.isDemo ? [] : goalsToCelebrate(revenueCents, celebrated.map((c) => c.amountCents)).map((g) => g.cents);
  return { progress, toCelebrate };
}

/**
 * Regista as metas como celebradas (idempotente). Só aceita metas que o faturamento real já atingiu,
 * por isso o browser não consegue marcar metas por atingir.
 */
export async function acknowledgeRevenueGoals(scope: Scope, amounts: unknown): Promise<number[]> {
  if (scope.isDemo || !Array.isArray(amounts)) return [];
  const revenue = await lifetimeRevenueCents(scope);
  const valid = REVENUE_GOALS.filter((g) => amounts.includes(g.cents) && revenue >= g.cents).map((g) => g.cents);
  if (valid.length) {
    await prisma.revenueMilestone.createMany({ data: valid.map((amountCents) => ({ userId: scope.ownerId, amountCents })), skipDuplicates: true });
  }
  return valid;
}
