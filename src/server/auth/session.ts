import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getUserBySessionToken, type AuthUser } from "./service";
import { SESSION_COOKIE } from "./tokens";

export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const store = await cookies();
  return getUserBySessionToken(store.get(SESSION_COOKIE)?.value);
});

/** Garante sessão válida no servidor. Usar em todas as páginas privadas e server actions. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
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
