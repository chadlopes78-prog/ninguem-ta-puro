"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/server/rate-limit";
import { recoverAccess } from "@/server/services/delivery";
import { getSettings } from "@/server/services/settings";

export type RecoverResult = { ok: true; purchases: { code: string; date: string; business: string; products: string[]; href: string }[] } | { ok: false; error: string };

/** Recuperação do acesso pelo próprio comprador (email + código da encomenda ou telemóvel do pagamento). */
export async function recoverAccessAction(input: { email?: string; code?: string; phone?: string }): Promise<RecoverResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  const email = typeof input?.email === "string" ? input.email.slice(0, 200) : "";
  if (!rateLimit(`recover:${ip}`, 10, 15 * 60_000) || !rateLimit(`recover-email:${email.toLowerCase()}`, 6, 15 * 60_000)) {
    return { ok: false, error: "Demasiadas tentativas. Aguarde alguns minutos." };
  }
  const code = typeof input?.code === "string" ? input.code.slice(0, 40) : "";
  const phone = typeof input?.phone === "string" ? input.phone.slice(0, 30) : "";
  if (!email || (!code && !phone)) return { ok: false, error: "Indique o email e o código da encomenda (ou o telemóvel usado no pagamento)." };
  const found = await recoverAccess({ email, code, phone });
  if (!found.length) return { ok: false, error: "Não encontrámos compras confirmadas com estes dados. Verifique o email e o código (ex.: NTP-AB12CD34)." };
  const names = new Map<string, string>();
  for (const f of found) if (!names.has(f.ownerId)) names.set(f.ownerId, (await getSettings(f.ownerId)).businessName);
  return { ok: true, purchases: found.map((f) => ({ code: f.code, date: f.createdAt.toISOString().slice(0, 10), business: names.get(f.ownerId) ?? "", products: f.products, href: f.href })) };
}
