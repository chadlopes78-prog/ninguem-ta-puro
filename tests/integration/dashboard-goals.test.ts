// Dashboard (sessão 21): faturamento acumulado para as metas (só pedidos aprovados, por conta),
// celebrações persistentes sem repetição e atividades de hoje no fuso da conta.
import { beforeEach, describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { scopeOf, type Scope } from "@/server/scope";
import { acknowledgeRevenueGoals, getRevenueGoalState, getTodayActivity, lifetimeRevenueCents } from "@/server/services/dashboard-extras";
import { computeKpis } from "@/server/services/metrics-logic";

let S: Scope;
let OTHER: Scope;
let seq = 0;
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
  OTHER = scopeOf((await testSeller("outra@ntp.local")).id, false);
});

async function order(scope: Scope, units: number, status: OrderStatus, over: Record<string, unknown> = {}) {
  const customer = await prisma.customer.upsert({
    where: { ownerId_email_isDemo: { ownerId: scope.ownerId, email: "ana@exemplo.co.mz", isDemo: scope.isDemo } },
    create: { ownerId: scope.ownerId, isDemo: scope.isDemo, email: "ana@exemplo.co.mz", name: "Ana" },
    update: {},
  });
  const cents = units * 100;
  return prisma.order.create({
    data: {
      code: `NTP-T${String(seq++).padStart(7, "0")}`,
      customerId: customer.id,
      ownerId: scope.ownerId,
      isDemo: scope.isDemo,
      source: scope.isDemo ? "DEMO" : "CHECKOUT",
      currency: "MZN",
      status,
      subtotalCents: cents,
      totalCents: cents,
      netCents: cents,
      approvedAt: status === "APPROVED" ? new Date() : null,
      ...over,
    },
  });
}

describe("metas de faturamento", () => {
  it("conta só pedidos aprovados (pendentes, recusados, cancelados, reembolsados e de teste não contam); igual à Faturação bruta", async () => {
    await order(S, 5_000, "APPROVED");
    await order(S, 2_500, "APPROVED");
    await order(S, 90_000, "PENDING");
    await order(S, 90_000, "DECLINED");
    await order(S, 90_000, "CANCELED");
    await order(S, 90_000, "REFUNDED");
    await order(S, 90_000, "APPROVED", { isTestPayment: true });
    expect(await lifetimeRevenueCents(S)).toBe(750_000);
    const st = await getRevenueGoalState(S);
    expect(st.progress).toMatchObject({ percent: 75, remainingCents: 250_000 });
    expect(st.toCelebrate).toEqual([]);
    // mesma definição que a «Faturação bruta» do Dashboard
    const rows = await prisma.order.findMany({ where: { ownerId: S.ownerId, isTestPayment: false }, include: { items: true } });
    expect(computeKpis(rows.map((r) => ({ ...r, items: [] })), "MZN", 0).grossCents).toBe(750_000);
  });

  it("ao atingir 10.000 celebra uma vez; recarregar não repete; a próxima meta passa a 50.000", async () => {
    await order(S, 10_000, "APPROVED");
    let st = await getRevenueGoalState(S);
    expect(st.toCelebrate).toEqual([1_000_000]);
    expect(st.progress.target.cents).toBe(5_000_000);
    await acknowledgeRevenueGoals(S, st.toCelebrate);
    await acknowledgeRevenueGoals(S, st.toCelebrate); // idempotente
    expect(await prisma.revenueMilestone.count({ where: { userId: S.ownerId } })).toBe(1);
    st = await getRevenueGoalState(S);
    expect(st.toCelebrate).toEqual([]);
  });

  it("várias metas de uma vez são reconhecidas juntas; 1 milhão conclui a barra", async () => {
    await order(S, 120_000, "APPROVED");
    let st = await getRevenueGoalState(S);
    expect(st.toCelebrate).toEqual([1_000_000, 5_000_000, 10_000_000]);
    expect(st.progress.target.cents).toBe(50_000_000);
    await acknowledgeRevenueGoals(S, st.toCelebrate);
    await order(S, 900_000, "APPROVED");
    st = await getRevenueGoalState(S);
    expect(st.toCelebrate).toEqual([50_000_000, 100_000_000]);
    expect(st.progress).toMatchObject({ completed: true, percent: 100, next: null });
  });

  it("não aceita celebrar metas por atingir; isolamento entre contas; modo demo sem celebrações", async () => {
    await order(S, 9_000, "APPROVED");
    expect(await acknowledgeRevenueGoals(S, [1_000_000, 5_000_000])).toEqual([]);
    expect(await prisma.revenueMilestone.count()).toBe(0);

    await order(OTHER, 60_000, "APPROVED");
    expect(await lifetimeRevenueCents(S)).toBe(900_000);
    expect(await lifetimeRevenueCents(OTHER)).toBe(6_000_000);
    await acknowledgeRevenueGoals(OTHER, [1_000_000, 5_000_000]);
    expect((await getRevenueGoalState(S)).toCelebrate).toEqual([]);
    expect(await prisma.revenueMilestone.count({ where: { userId: S.ownerId } })).toBe(0);

    const demo = scopeOf(S.ownerId, true);
    await order(demo, 20_000, "APPROVED");
    expect(await lifetimeRevenueCents(S)).toBe(900_000); // demo não se mistura com o real
    expect((await getRevenueGoalState(demo)).toCelebrate).toEqual([]);
    expect(await acknowledgeRevenueGoals(demo, [1_000_000])).toEqual([]);
  });
});

describe("atividades recentes (hoje)", () => {
  it("mostra atividades de hoje; as de ontem não aparecem; por conta; mais recentes primeiro", async () => {
    const now = new Date("2026-10-16T10:00:00Z"); // 12:00 em Maputo
    await order(S, 100, "PENDING", { createdAt: new Date("2026-10-16T09:00:00Z") });
    await order(S, 200, "APPROVED", { createdAt: new Date("2026-10-15T21:00:00Z"), approvedAt: new Date("2026-10-15T21:05:00Z") }); // ontem 23:00 em Maputo
    await order(S, 300, "APPROVED", { createdAt: new Date("2026-10-15T21:30:00Z"), approvedAt: new Date("2026-10-15T22:15:00Z") }); // pago hoje 00:15
    await order(OTHER, 400, "PENDING", { createdAt: new Date("2026-10-16T09:30:00Z") });
    const r = await getTodayActivity(S, "Africa/Maputo", now);
    expect(r.dayKey).toBe("2026-10-16");
    expect(r.activities.map((a) => [a.kind, a.totalCents])).toEqual([
      ["created", 10_000],
      ["approved", 30_000],
    ]);
    // à meia-noite muda de dia: no dia seguinte já não há atividades
    expect((await getTodayActivity(S, "Africa/Maputo", new Date("2026-10-16T22:00:00Z"))).activities).toEqual([]);
    // o histórico continua guardado
    expect(await prisma.order.count({ where: { ownerId: S.ownerId } })).toBe(3);
  });
});
