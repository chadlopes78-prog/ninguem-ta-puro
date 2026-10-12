// Lógica de autenticação independente do Next (testável).
import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "./password";
import { hashToken, newSessionToken, SESSION_TTL_MS } from "./tokens";

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type AuthUser = { id: string; email: string; name: string };

export async function hasAnyUser(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

export async function createUser(input: { email: string; name: string; password: string }): Promise<AuthUser> {
  const user = await prisma.user.create({
    data: { email: input.email.toLowerCase().trim(), name: input.name.trim(), passwordHash: await hashPassword(input.password) },
  });
  return { id: user.id, email: user.email, name: user.name };
}

export async function isRateLimited(key: string, now = new Date()): Promise<boolean> {
  const failures = await prisma.loginAttempt.count({
    where: { key, success: false, createdAt: { gte: new Date(now.getTime() - LOGIN_WINDOW_MS) } },
  });
  return failures >= LOGIN_MAX_FAILURES;
}

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; user: AuthUser }
  | { ok: false; reason: "invalid" | "rate_limited" };

export async function login(email: string, password: string, meta: { ip?: string; userAgent?: string } = {}): Promise<LoginResult> {
  const normalized = email.toLowerCase().trim();
  const key = `${normalized}|${meta.ip ?? "?"}`;
  if (await isRateLimited(key)) return { ok: false, reason: "rate_limited" };

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  // Executa sempre uma verificação para reduzir diferenças de tempo entre utilizador existente/inexistente
  const valid = user
    ? await verifyPassword(password, user.passwordHash)
    : (await verifyPassword(password, DUMMY_HASH), false);

  await prisma.loginAttempt.create({ data: { key, success: valid } });
  if (!user || !valid) return { ok: false, reason: "invalid" };

  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId: user.id, expiresAt, userAgent: meta.userAgent?.slice(0, 255) },
  });
  return { ok: true, token, expiresAt, user: { id: user.id, email: user.email, name: user.name } };
}

export async function getUserBySessionToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

export async function revokeSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
}

export async function changePassword(userId: string, current: string, next: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !(await verifyPassword(current, user.passwordHash))) return false;
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  return true;
}

// hash de uma password aleatória, apenas para igualar o custo de verificação
const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");
