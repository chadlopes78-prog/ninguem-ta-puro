// Regras puras de validação e cálculo de cupões (sem acesso à base de dados).
import { percentOf, type CurrencyCode } from "@/lib/money";

export interface CouponLike {
  code: string;
  type: "PERCENT" | "FIXED";
  percentOff: number | null;
  amountOffCents: number | null;
  currency: CurrencyCode | null;
  appliesToAll: boolean;
  productIds: string[];
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usesCount: number;
  isActive: boolean;
}

export type CouponFailure = "not_found" | "inactive" | "not_started" | "expired" | "exhausted" | "product_not_eligible" | "currency_mismatch";

export type CouponEvaluation =
  | { ok: true; discountCents: number; totalCents: number; label: string }
  | { ok: false; reason: CouponFailure; message: string };

export const COUPON_MESSAGES: Record<CouponFailure, string> = {
  not_found: "Cupão não encontrado. Verifique o código.",
  inactive: "Este cupão não está ativo.",
  not_started: "Este cupão ainda não está válido.",
  expired: "Este cupão expirou.",
  exhausted: "Este cupão atingiu o limite de utilizações.",
  product_not_eligible: "Este cupão não é válido para este produto.",
  currency_mismatch: "Este cupão não é compatível com a moeda deste produto.",
};

function fail(reason: CouponFailure): CouponEvaluation {
  return { ok: false, reason, message: COUPON_MESSAGES[reason] };
}

export function evaluateCoupon(
  coupon: CouponLike | null,
  ctx: { productId: string; currency: CurrencyCode; subtotalCents: number; now: Date },
): CouponEvaluation {
  if (!coupon) return fail("not_found");
  if (!coupon.isActive) return fail("inactive");
  if (coupon.startsAt && ctx.now < coupon.startsAt) return fail("not_started");
  if (coupon.endsAt && ctx.now >= coupon.endsAt) return fail("expired");
  if (coupon.maxUses !== null && coupon.usesCount >= coupon.maxUses) return fail("exhausted");
  if (!coupon.appliesToAll && !coupon.productIds.includes(ctx.productId)) return fail("product_not_eligible");

  let discount: number;
  let label: string;
  if (coupon.type === "PERCENT") {
    const pct = coupon.percentOff ?? 0;
    discount = percentOf(ctx.subtotalCents, pct);
    label = `${pct}%`;
  } else {
    if (coupon.currency !== ctx.currency) return fail("currency_mismatch");
    discount = coupon.amountOffCents ?? 0;
    label = "valor fixo";
  }
  discount = Math.max(0, Math.min(discount, ctx.subtotalCents));
  return { ok: true, discountCents: discount, totalCents: ctx.subtotalCents - discount, label };
}
