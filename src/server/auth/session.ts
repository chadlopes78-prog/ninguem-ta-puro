import "server-only";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { canAdminister, canUseApp } from "./policy";
import { cache } from "react";
import { getUserBySessionToken, type AuthUser } from "./service";
import { SESSION_COOKIE } from "./tokens";

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const store = await cookies();
  return getUserBySessionToken(store.get(SESSION_COOKIE)?.value);
});

/**
 * Garante sessão válida E conta aprovada e não suspensa. Usar em todas as páginas privadas e server actions.
 * Contas pendentes, rejeitadas ou suspensas vão para /conta (página de estado), sem acesso a dados.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canUseApp(user)) redirect("/conta");
  return user;
}

/** Para rotas de API: utilizador com acesso ao painel, ou null (a rota responde 401/403). */
export async function getActiveUser(): Promise<AuthUser | null> {
  const user = await getCurrentUser();
  return user && canUseApp(user) ? user : null;
}

/** Administração da Plataforma: só a conta OWNER aprovada. Qualquer outra conta recebe 404 (não revela a área). */
export async function requireOwner(): Promise<AuthUser> {
  const user = await requireUser();
  if (!canAdminister(user)) notFound();
  return user;
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "true",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<string | undefined> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  store.delete(SESSION_COOKIE);
  return token;
}

export async function requestMeta(): Promise<{ ip?: string; userAgent?: string }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  return { ip, userAgent: h.get("user-agent") ?? undefined };
}
