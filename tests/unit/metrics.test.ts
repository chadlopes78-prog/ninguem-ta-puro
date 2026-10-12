import { describe, expect, it } from "vitest";
import { computeKpis, dailySeries, percentChange, productPerformance, statusDistribution, type MetricOrder } from "@/server/services/metrics-logic";
import { canTransition, computeOrderTotals } from "@/server/services/order-logic";

const o = (status: MetricOrder["status"], totalCents: number, extra: Partial<MetricOrder> = {}): MetricOrder => ({
  status,
  currency: "BRL",
  totalCents,
  feeCents: 0,
  createdAt: new Date("2026-10-10T15:00:00Z"),
  checkoutId: "c1",
  items: [{ productId: "p1", productName: "P1", totalCents, kind: "MAIN" }],
  ...extra,
});

describe("computeKpis", () => {
  const orders = [o("APPROVED", 19700), o("APPROVED", 54500, { feeCents: 500 }), o("PENDING", 19700), o("DECLINED", 19700), o("REFUNDED", 44800), o("CANCELED", 100), o("APPROVED", 10000, { currency: "EUR" })];
  const k = computeKpis(orders, "BRL", 10);
  it("faturação bruta só inclui aprovados da mesma moeda", () => expect(k.grossCents).toBe(74200));
  it("pendentes e recusados não entram na faturação", () => {
    expect(k.pendingCount).toBe(1);
    expect(k.totalOrders).toBe(6);
  });
  it("ticket médio", () => expect(k.avgTicketCents).toBe(37100));
  it("reembolsos à parte", () => expect(k).toMatchObject({ refundCount: 1, refundCents: 44800 }));
  it("líquido = bruto − taxas registadas", () => expect(k.netCents).toBe(73700));
  it("conversão = aprovados atribuíveis / sessões", () => expect(k.conversionRate).toBe(20));
  it("sem sessões não há conversão", () => expect(computeKpis(orders, "BRL", 0).conversionRate).toBeNull());
  it("sem aprovados não há ticket", () => expect(computeKpis([], "BRL", 0).avgTicketCents).toBeNull());
  it("exemplo de demonstração 42 pedidos = 12.450,00", () => {
    const demo = [...Array(30).fill(0).map(() => o("APPROVED", 19700)), ...Array(12).fill(0).map(() => o("APPROVED", 54500))];
    const d = computeKpis(demo, "BRL", 0);
    expect(d.grossCents).toBe(1245000);
    expect(d.approvedCount).toBe(42);
    expect(d.avgTicketCents).toBe(29643);
  });
});

describe("séries e distribuição", () => {
  it("agrupa por dia no fuso", () => {
    const s = dailySeries([o("APPROVED", 100, { createdAt: new Date("2026-10-11T02:00:00Z") }), o("PENDING", 50)], "BRL", ["2026-10-10", "2026-10-11"], "America/Sao_Paulo");
    expect(s[0]).toMatchObject({ day: "2026-10-10", revenueCents: 100, orders: 2, approved: 1 });
    expect(s[1].orders).toBe(0);
  });
  it("produtos e estados", () => {
    expect(productPerformance([o("APPROVED", 100), o("PENDING", 100)], "BRL")[0]).toMatchObject({ revenueCents: 100, units: 1 });
    expect(statusDistribution([o("APPROVED", 1), o("APPROVED", 1), o("REFUNDED", 1)], "BRL").find((s) => s.status === "APPROVED")?.count).toBe(2);
  });
  it("variação percentual", () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(10, 0)).toBeNull();
  });
});

describe("regras de pedidos", () => {
  it("modo real não permite aprovar ou reembolsar manualmente", () => {
    expect(canTransition("PENDING", "APPROVED", { isDemo: false }).ok).toBe(false);
    expect(canTransition("APPROVED", "REFUNDED", { isDemo: false }).ok).toBe(false);
    expect(canTransition("PENDING", "CANCELED", { isDemo: false }).ok).toBe(true);
  });
  it("modo demo permite simulação coerente", () => {
    expect(canTransition("PENDING", "APPROVED", { isDemo: true }).ok).toBe(true);
    expect(canTransition("DECLINED", "APPROVED", { isDemo: true }).ok).toBe(false);
    expect(canTransition("APPROVED", "CANCELED", { isDemo: true }).ok).toBe(false);
  });
  it("totais do pedido", () => {
    expect(computeOrderTotals([{ unitPriceCents: 19700, quantity: 1 }, { unitPriceCents: 9700, quantity: 1 }], 1970, 300)).toEqual({
      subtotalCents: 29400,
      discountCents: 1970,
      totalCents: 27430,
      feeCents: 300,
      netCents: 27130,
    });
    expect(computeOrderTotals([{ unitPriceCents: 100, quantity: 1 }], 500).totalCents).toBe(0);
  });
});
