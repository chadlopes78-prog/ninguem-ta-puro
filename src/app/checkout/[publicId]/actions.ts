"use server";

import { headers } from "next/headers";
import { BUYER_IP_CEILING, rateLimit } from "@/server/rate-limit";
import { previewCoupon, submitCheckout, type PurchaseOutcome } from "@/server/services/purchase";

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function submitCheckoutAction(publicId: string, input: Record<string, string>, sessionId?: string): Promise<PurchaseOutcome> {
  // por comprador (telefone/email) neste checkout + teto por IP (CGNAT: muitos clientes no mesmo IP)
  const ip = await clientKey();
  const who = (typeof input?.phone === "string" && input.phone.replace(/\D/g, "").slice(-9)) || (typeof input?.email === "string" && input.email.trim().toLowerCase().slice(0, 120)) || "anon";
  if (!rateLimit(`co-submit:${ip}:${publicId}:${who}`, 10, 10 * 60_000) || !rateLimit(`co-submit-ip:${ip}`, BUYER_IP_CEILING, 10 * 60_000)) {
    return { kind: "invalid", fieldErrors: { _form: "Demasiadas tentativas. Aguarde alguns minutos." } };
  }
  const clean: Record<string, string> = {};
  for (const k of ["name", "email", "phone", "document", "coupon", "method", "idempotencyKey"]) if (typeof input?.[k] === "string") clean[k] = input[k].slice(0, 300);
  const outcome = await submitCheckout(publicId, clean, typeof sessionId === "string" ? sessionId.slice(0, 40) : undefined);
  // Contexto técnico para a API de Conversões da Meta (navegador, clique do anúncio). Não altera a compra.
  if (outcome.kind === "payment_started") {
    try {
      const h = await headers();
      const { recordTrackingContext } = await import("@/server/services/meta-capi");
      await recordTrackingContext(outcome.token, { userAgent: h.get("user-agent"), referer: h.get("referer") });
    } catch {}
  }
  return outcome;
}

export async function applyCouponAction(publicId: string, code: string) {
  if (!rateLimit(`co-coupon:${await clientKey()}`, 200, 10 * 60_000)) return { ok: false as const, message: "Demasiadas tentativas. Aguarde alguns minutos." };
  if (typeof code !== "string" || code.length > 32) return { ok: false as const, message: "Código inválido." };
  return previewCoupon(publicId, code);
}
