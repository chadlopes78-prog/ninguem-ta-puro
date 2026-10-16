// Dashboard: metas de faturamento e "hoje" no fuso da conta (funções puras).
import { describe, expect, it } from "vitest";
import { REVENUE_GOALS, formatGoalMzn, goalProgress, goalsToCelebrate } from "@/lib/revenue-goals";
import { buildActivities, zonedTodayBounds, type ActivityOrder } from "@/lib/activity";

const MZN = (units: number) => units * 100;

describe("metas de faturamento", () => {
  it("7.500 MZN → 75% da primeira meta (10.000), faltam 2.500", () => {
    const p = goalProgress(MZN(7_500));
    expect(p).toMatchObject({ percent: 75, remainingCents: MZN(2_500), completed: false });
    expect(p.target.cents).toBe(MZN(10_000));
    expect(p.next!.ordinal).toBe("primeira");
  });

  it("ao atingir cada meta a próxima passa a ser a seguinte", () => {
    expect(goalProgress(MZN(10_000)).target.cents).toBe(MZN(50_000));
    expect(goalProgress(MZN(10_000)).percent).toBe(20);
    expect(goalProgress(MZN(50_000)).target.cents).toBe(MZN(100_000));
    expect(goalProgress(MZN(100_000)).target.cents).toBe(MZN(500_000));
    expect(goalProgress(MZN(500_000)).target.cents).toBe(MZN(1_000_000));
    expect(goalProgress(0)).toMatchObject({ percent: 0, remainingCents: MZN(10_000) });
    // nunca 100% antes de atingir
    expect(goalProgress(MZN(9_999.99)).percent).toBe(99);
  });

  it("1 milhão: barra concluída, não recomeça nos 10.000 nem mostra 1 milhão como por atingir", () => {
    for (const v of [MZN(1_000_000), MZN(3_400_000)]) {
      const p = goalProgress(v);
      expect(p).toMatchObject({ completed: true, percent: 100, remainingCents: 0, next: null });
      expect(p.target.cents).toBe(MZN(1_000_000));
    }
  });

  it("celebra só metas atingidas e ainda não celebradas (várias de uma vez)", () => {
    expect(goalsToCelebrate(MZN(9_000), [])).toEqual([]);
    expect(goalsToCelebrate(MZN(10_000), []).map((g) => g.message)).toEqual(["Parabéns! Atingiste os teus primeiros 10 mil MZN em faturamento!"]);
    expect(goalsToCelebrate(MZN(120_000), [MZN(10_000)]).map((g) => g.cents)).toEqual([MZN(50_000), MZN(100_000)]);
    expect(goalsToCelebrate(MZN(120_000), [MZN(10_000), MZN(50_000), MZN(100_000)])).toEqual([]);
    expect(REVENUE_GOALS.map((g) => g.message)).toEqual([
      "Parabéns! Atingiste os teus primeiros 10 mil MZN em faturamento!",
      "Parabéns! Já faturaste 50 mil MZN!",
      "Incrível! Atingiste 100 mil MZN em faturamento!",
      "Fantástico! Já faturaste meio milhão de meticais!",
      "Parabéns! Atingiste 1 milhão de MZN em faturamento!",
    ]);
  });

  it("formato", () => {
    expect(formatGoalMzn(MZN(7_500))).toBe("7.500 MZN");
    expect(formatGoalMzn(MZN(1_000_000))).toBe("1.000.000 MZN");
    expect(formatGoalMzn(0)).toBe("0 MZN");
  });
});

describe("atividades de hoje (Africa/Maputo, UTC+2)", () => {
  const TZ = "Africa/Maputo";
  const order = (id: string, over: Partial<ActivityOrder>): ActivityOrder => ({
    id, code: `NTP-${id}`, status: "PENDING", totalCents: 100, currency: "MZN", customerName: "Ana", productName: "Ebook",
    createdAt: new Date("2026-10-01T10:00:00Z"), approvedAt: null, canceledAt: null, refundedAt: null, ...over,
  });

  it("o dia muda à meia-noite de Maputo (22:00 UTC), não à meia-noite UTC", () => {
    // 16/10 00:30 em Maputo = 15/10 22:30 UTC
    const b = zonedTodayBounds(TZ, new Date("2026-10-15T22:30:00Z"));
    expect(b.dayKey).toBe("2026-10-16");
    expect(b.from.toISOString()).toBe("2026-10-15T22:00:00.000Z");
    expect(b.to.toISOString()).toBe("2026-10-16T22:00:00.000Z");
    // 15/10 23:59 em Maputo ainda é dia 15
    expect(zonedTodayBounds(TZ, new Date("2026-10-15T21:59:00Z")).dayKey).toBe("2026-10-15");
  });

  it("só eventos de hoje, com a data real do evento, do mais recente para o mais antigo", () => {
    const { from, to } = zonedTodayBounds(TZ, new Date("2026-10-16T08:00:00Z"));
    const acts = buildActivities(
      [
        order("ontem", { createdAt: new Date("2026-10-15T21:30:00Z") }), // 23:30 de ontem em Maputo
        order("hoje-cedo", { createdAt: new Date("2026-10-15T22:10:00Z") }), // 00:10 de hoje em Maputo
        // criado ontem, pago hoje: só o pagamento é atividade de hoje
        order("pago-hoje", { status: "APPROVED", createdAt: new Date("2026-10-15T20:00:00Z"), approvedAt: new Date("2026-10-16T07:00:00Z") }),
        order("amanha", { createdAt: new Date("2026-10-16T22:00:00Z") }),
      ],
      from,
      to,
    );
    expect(acts.map((a) => a.key)).toEqual(["pago-hoje:approved", "hoje-cedo:created"]);
    expect(acts[0].at.toISOString()).toBe("2026-10-16T07:00:00.000Z");
  });

  it("sem atividades hoje → lista vazia", () => {
    const { from, to } = zonedTodayBounds(TZ, new Date("2026-10-16T08:00:00Z"));
    expect(buildActivities([order("x", { createdAt: new Date("2026-10-14T10:00:00Z") })], from, to)).toEqual([]);
  });
});
