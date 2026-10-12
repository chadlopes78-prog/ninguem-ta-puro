import { describe, expect, it } from "vitest";
import { evaluateCoupon, type CouponLike } from "@/server/services/coupon-logic";
import { couponSchema } from "@/server/validation/schemas";

const base: CouponLike = {
  code: "TESTE10",
  type: "PERCENT",
  percentOff: 10,
  amountOffCents: null,
  currency: null,
  appliesToAll: true,
  productIds: [],
  startsAt: null,
  endsAt: null,
  maxUses: null,
  usesCount: 0,
  isActive: true,
};
const ctx = { productId: "p1", currency: "BRL" as const, subtotalCents: 19700, now: new Date("2026-10-12T12:00:00Z") };

describe("evaluateCoupon", () => {
  it("cupão válido TESTE10 aplica 10%", () => {
    const r = evaluateCoupon(base, ctx);
    expect(r).toMatchObject({ ok: true, discountCents: 1970, totalCents: 17730 });
  });
  it("inexistente", () => expect(evaluateCoupon(null, ctx)).toMatchObject({ ok: false, reason: "not_found" }));
  it("expirado", () =>
    expect(evaluateCoupon({ ...base, endsAt: new Date("2026-10-01T00:00:00Z") }, ctx)).toMatchObject({ ok: false, reason: "expired" }));
  it("ainda não válido", () =>
    expect(evaluateCoupon({ ...base, startsAt: new Date("2026-11-01T00:00:00Z") }, ctx)).toMatchObject({ ok: false, reason: "not_started" }));
  it("limite de utilizações atingido", () =>
    expect(evaluateCoupon({ ...base, maxUses: 5, usesCount: 5 }, ctx)).toMatchObject({ ok: false, reason: "exhausted" }));
  it("produto não elegível", () =>
    expect(evaluateCoupon({ ...base, appliesToAll: false, productIds: ["p2"] }, ctx)).toMatchObject({ ok: false, reason: "product_not_eligible" }));
  it("inativo", () => expect(evaluateCoupon({ ...base, isActive: false }, ctx)).toMatchObject({ ok: false, reason: "inactive" }));
  it("fixo exige moeda compatível", () => {
    const fixed = { ...base, type: "FIXED" as const, percentOff: null, amountOffCents: 5000, currency: "EUR" as const };
    expect(evaluateCoupon(fixed, ctx)).toMatchObject({ ok: false, reason: "currency_mismatch" });
    expect(evaluateCoupon({ ...fixed, currency: "BRL" }, ctx)).toMatchObject({ ok: true, discountCents: 5000, totalCents: 14700 });
  });
  it("desconto nunca excede o subtotal", () => {
    const fixed = { ...base, type: "FIXED" as const, percentOff: null, amountOffCents: 999999, currency: "BRL" as const };
    expect(evaluateCoupon(fixed, ctx)).toMatchObject({ ok: true, discountCents: 19700, totalCents: 0 });
  });
});

describe("couponSchema", () => {
  it("normaliza código e valida percentagem", () => {
    const r = couponSchema.safeParse({ code: "teste10", type: "PERCENT", percentOff: "10", appliesToAll: "on", isActive: "on" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.code).toBe("TESTE10");
  });
  it("rejeita percentagem fora do intervalo, datas invertidas e fixo sem moeda", () => {
    const r = couponSchema.safeParse({ code: "X12", type: "PERCENT", percentOff: "150", appliesToAll: "on", startsAt: "2026-10-10", endsAt: "2026-10-01" });
    expect(r.success).toBe(false);
    const keys = r.success ? [] : r.error.issues.map((i) => i.path.join("."));
    expect(keys).toEqual(expect.arrayContaining(["percentOff", "endsAt"]));
    const f = couponSchema.safeParse({ code: "FIX", type: "FIXED", amountOff: "10,00", appliesToAll: "on" });
    expect(f.success).toBe(false);
  });
  it("exige produtos quando não aplica a todos", () => {
    const r = couponSchema.safeParse({ code: "ABC", type: "PERCENT", percentOff: 5 });
    expect(r.success).toBe(false);
  });
  it("rejeita caracteres inválidos", () => {
    expect(couponSchema.safeParse({ code: "AB C!", type: "PERCENT", percentOff: 5, appliesToAll: "on" }).success).toBe(false);
  });
});
