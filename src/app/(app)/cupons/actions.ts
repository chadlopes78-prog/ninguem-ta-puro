"use server";

import { revalidatePath } from "next/cache";
import { own } from "@/server/scope";
import { assertId, formToObject, guarded, parseForm } from "@/server/actions";
import { couponSchema } from "@/server/validation/schemas";
import { createCoupon, deleteCoupon, DuplicateCodeError, evaluateCouponCode, setCouponActive, updateCoupon } from "@/server/services/coupons";
import { prisma } from "@/server/db";
import { formatMoney } from "@/lib/money";
import type { ActionResult } from "@/server/validation/common";

export async function saveCouponAction(id: string | null, fd: FormData) {
  return guarded<{ id: string }>(async ({ scope, settings }) => {
    const p = parseForm(couponSchema, formToObject(fd));
    if (!p.ok) return p.result;
    try {
      const c = id ? await updateCoupon(assertId(id), p.data, scope, settings.timezone) : await createCoupon(p.data, scope, settings.timezone);
      revalidatePath("/cupons");
      return { ok: true, data: { id: c.id }, message: id ? "Cupão atualizado." : "Cupão criado." };
    } catch (e) {
      if (e instanceof DuplicateCodeError) return { ok: false, error: e.message, fieldErrors: { code: e.message } };
      throw e;
    }
  });
}

export async function setCouponActiveAction(id: string, active: boolean) {
  return guarded(async ({ scope }) => {
    await setCouponActive(assertId(id), active, scope);
    revalidatePath("/cupons");
    return { ok: true, message: active ? "Cupão ativado." : "Cupão desativado." };
  });
}

export async function deleteCouponAction(id: string) {
  return guarded(async ({ scope }) => {
    await deleteCoupon(assertId(id), scope);
    revalidatePath("/cupons");
    return { ok: true, message: "Cupão eliminado." };
  });
}

/** Testa um código contra uma oferta, sem o consumir. */
export async function testCouponAction(fd: FormData) {
  return guarded<{ summary: string }>(async ({ scope }): Promise<ActionResult<{ summary: string }>> => {
    const code = String(fd.get("code") ?? "").slice(0, 32);
    const offerId = String(fd.get("offerId") ?? "");
    const offer = await prisma.offer.findFirst({ where: { id: offerId, product: own(scope) } });
    if (!offer) return { ok: false, error: "Selecione um produto/oferta.", fieldErrors: { offerId: "Selecione uma oferta" } };
    if (!code.trim()) return { ok: false, error: "Introduza um código.", fieldErrors: { code: "Introduza um código" } };
    const { evaluation } = await evaluateCouponCode(code, { scope, productId: offer.productId, currency: offer.currency, subtotalCents: offer.priceCents });
    if (!evaluation.ok) return { ok: false, error: evaluation.message, fieldErrors: { code: evaluation.message } };
    const summary = `Válido: ${formatMoney(offer.priceCents, offer.currency)} − ${formatMoney(evaluation.discountCents, offer.currency)} = ${formatMoney(evaluation.totalCents, offer.currency)}`;
    return { ok: true, data: { summary }, message: summary };
  });
}
