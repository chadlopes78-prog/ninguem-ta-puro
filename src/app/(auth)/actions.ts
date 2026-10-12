"use server";

import { redirect } from "next/navigation";
import { createUser, hasAnyUser, login, revokeSession } from "@/server/auth/service";
import { clearSessionCookie, requestMeta, setSessionCookie } from "@/server/auth/session";
import { loginSchema, setupSchema } from "@/server/validation/schemas";
import { flattenErrors, type ActionResult } from "@/server/validation/common";
import { hit, isLimited } from "@/server/rate-limit";

function safeNext(next: unknown): string {
  return typeof next === "string" && /^\/(?!\/)[\w\-/?=&%.]*$/.test(next) ? next : "/dashboard";
}

export async function loginAction(fd: FormData): Promise<ActionResult<{ next: string }>> {
  const parsed = loginSchema.safeParse({ email: fd.get("email"), password: fd.get("password") });
  if (!parsed.success) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: flattenErrors(parsed.error) };
  const meta = await requestMeta();
  // Limite por IP de tentativas falhadas (qualquer email); o limite por email+IP é persistido na BD.
  const ipKey = `login-fail:${meta.ip ?? "?"}`;
  if (isLimited(ipKey, 20)) return { ok: false, error: "Demasiadas tentativas. Aguarde alguns minutos." };
  const r = await login(parsed.data.email, parsed.data.password, meta);
  if (!r.ok) {
    hit(ipKey, 15 * 60_000);
    return {
      ok: false,
      error: r.reason === "rate_limited" ? "Demasiadas tentativas falhadas. Aguarde 15 minutos." : "Email ou password incorretos.",
    };
  }
  await setSessionCookie(r.token, r.expiresAt);
  return { ok: true, data: { next: safeNext(fd.get("next")) }, message: `Bem-vindo, ${r.user.name}.` };
}

export async function setupAction(fd: FormData): Promise<ActionResult<{ next: string }>> {
  if (await hasAnyUser()) return { ok: false, error: "A conta de proprietário já foi criada. Inicie sessão." };
  const parsed = setupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: flattenErrors(parsed.error) };
  await createUser(parsed.data);
  const r = await login(parsed.data.email, parsed.data.password, await requestMeta());
  if (r.ok) await setSessionCookie(r.token, r.expiresAt);
  return { ok: true, data: { next: "/dashboard" }, message: "Conta criada." };
}

export async function logoutAction() {
  const token = await clearSessionCookie();
  if (token) await revokeSession(token);
  redirect("/login");
}
