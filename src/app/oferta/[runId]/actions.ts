"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/server/rate-limit";
import { decideRun } from "@/server/services/purchase";
import { acceptUpsell, declineUpsell } from "@/server/services/post-purchase";

// Funil de demonstração (simulação, sem cobrança)
export async function decideRunAction(runId: string, stepKey: string, decision: "accept" | "decline") {
  if (decision !== "accept" && decision !== "decline") return { ok: false as const, message: "Decisão inválida." };
  if (typeof stepKey !== "string" || stepKey.length > 64) return { ok: false as const, message: "Etapa inválida." };
  return decideRun(runId, stepKey, decision);
}

// ───────────── Upsell real (encomenda e pagamento próprios) ─────────────

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function acceptUpsellAction(runId: string, stepKey: string, input: Record<string, string>) {
  if (!rateLimit(`upsell:${await clientKey()}:${runId}`, 10, 10 * 60_000)) return { kind: "invalid" as const, fieldErrors: { _form: "Demasiadas tentativas. Aguarde alguns minutos." } };
  if (typeof stepKey !== "string" || stepKey.length > 64) return { kind: "unavailable" as const, message: "Oferta inválida." };
  const pick = (k: string) => (typeof input?.[k] === "string" ? input[k].slice(0, 100) : undefined);
  return acceptUpsell(runId, stepKey, { method: pick("method"), phone: pick("phone"), idempotencyKey: pick("idempotencyKey") });
}

export async function declineUpsellAction(runId: string, stepKey: string) {
  if (typeof stepKey !== "string" || stepKey.length > 64) return null;
  return declineUpsell(runId, stepKey);
}
