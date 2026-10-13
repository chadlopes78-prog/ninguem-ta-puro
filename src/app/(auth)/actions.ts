"use server";

import { redirect } from "next/navigation";
import { createUser, EmailTakenError, hasAnyUser, login, registerUser, revokeSession } from "@/server/auth/service";
import { canUseApp } from "@/server/auth/policy";
import { clearSessionCookie, requestMeta, setSessionCookie } from "@/server/auth/session";
import { loginSchema, setupSchema } from "@/server/validation/schemas";
import { flattenErrors, type ActionResult } from "@/server/validation/common";
import { hit, isLimited, rateLimit } from "@/server/rate-limit";

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
  // Contas pendentes, rejeitadas ou suspensas só veem a página de estado da conta
  if (!canUseApp(r.user)) return { ok: true, data: { next: "/conta" } };
  return { ok: true, data: { next: safeNext(fd.get("next")) }, message: `Bem-vindo, ${r.user.name}.` };
}

export async function setupAction(fd: FormData): Promise<ActionResult<{ next: string }>> {
  if (await hasAnyUser()) return { ok: false, error: "A conta de proprietário já foi criada. Inicie sessão." };
  const parsed = setupSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: flattenErrors(parsed.error) };
  // Primeira conta da instalação: conta proprietária (OWNER), aprovada. Só possível com a base de dados vazia
  // (o índice único da base de dados impede um segundo OWNER, mesmo com pedidos simultâneos).
  try {
    await createUser(parsed.data, { role: "OWNER", status: "APPROVED" });
  } catch {
    return { ok: false, error: "A conta de proprietário já foi criada. Inicie sessão." };
  }
  const r = await login(parsed.data.email, parsed.data.password, await requestMeta());
  if (r.ok) await setSessionCookie(r.token, r.expiresAt);
  return { ok: true, data: { next: "/dashboard" }, message: "Conta criada." };
}

/**
 * Registo público. A conta é SEMPRE criada pendente de aprovação e com papel USER — decidido aqui, no servidor;
 * nada do formulário define papel ou estado. Não dá acesso ao painel até o proprietário aprovar.
 */
export async function registerAction(fd: FormData): Promise<ActionResult<{ next: string }>> {
  const meta = await requestMeta();
  if (!rateLimit(`register:${meta.ip ?? "?"}`, 5, 60 * 60_000)) return { ok: false, error: "Demasiados registos a partir desta ligação. Tente mais tarde." };
  if (!(await hasAnyUser())) return { ok: false, error: "A plataforma ainda não foi configurada." };
  const parsed = setupSchema.safeParse({ name: fd.get("name"), email: fd.get("email"), password: fd.get("password"), confirm: fd.get("confirm") });
  if (!parsed.success) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: flattenErrors(parsed.error) };
  try {
    await registerUser(parsed.data);
  } catch (e) {
    if (e instanceof EmailTakenError) return { ok: false, error: "Já existe uma conta com este email. Inicie sessão.", fieldErrors: { email: "Email já registado" } };
    throw e;
  }
  const r = await login(parsed.data.email, parsed.data.password, meta);
  if (r.ok) await setSessionCookie(r.token, r.expiresAt);
  return { ok: true, data: { next: "/conta" }, message: "Pedido de acesso enviado." };
}

export async function logoutAction() {
  const token = await clearSessionCookie();
  if (token) await revokeSession(token);
  redirect("/login");
}
