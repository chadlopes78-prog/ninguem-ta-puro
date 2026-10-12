"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/server/rate-limit";
import { previewCoupon, submitCheckout, type PurchaseOutcome } from "@/server/services/purchase";

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function submitCheckoutAction(publicId: string, input: Record<string, string>, sessionId?: string): Promise<PurchaseOutcome> {
  if (!rateLimit(`co-submit:${await clientKey()}:${publicId}`, 10, 10 * 60_000)) {
    return { kind: "invalid", fieldErrors: { _form: "Demasiadas tentativas. Aguarde alguns minutos." } };
  }
  const clean: Record<string, string> = {};
  for (const k of ["name", "email", "phone", "document", "coupon", "method", "idempotencyKey"]) if (typeof input?.[k] === "string") clean[k] = input[k].slice(0, 300);
  return submitCheckout(publicId, clean, typeof sessionId === "string" ? sessionId.slice(0, 40) : undefined);
}

export async function applyCouponAction(publicId: string, code: string) {
  if (!rateLimit(`co-coupon:${await clientKey()}`, 20, 10 * 60_000)) return { ok: false as const, message: "Demasiadas tentativas. Aguarde alguns minutos." };
  if (typeof code !== "string" || code.length > 32) return { ok: false as const, message: "Código inválido." };
  return previewCoupon(publicId, code);
}
