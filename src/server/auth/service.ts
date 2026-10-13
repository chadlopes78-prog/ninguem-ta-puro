// Lógica de autenticação independente do Next (testável).
import type { AccountStatus, UserRole } from "@prisma/client";
import { prisma } from "@/server/db";
import { hashPassword, verifyPassword } from "./password";
import { hashToken, newSessionToken, SESSION_TTL_MS } from "./tokens";

export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Utilizador da sessão. role/status/bannedAt vêm SEMPRE da base de dados, nunca do browser. */
export type AuthUser = { id: string; email: string; name: string; role: UserRole; status: AccountStatus; bannedAt: Date | null; themePreference?: string | null };

function toAuthUser(u: { id: string; email: string; name: string; role: UserRole; status: AccountStatus; bannedAt: Date | null; themePreference?: string | null }): AuthUser {
  return { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, bannedAt: u.bannedAt, themePreference: u.themePreference ?? null };
}

export async function hasAnyUser(): Promise<boolean> {
  return (await prisma.user.count()) > 0;
}

/**
 * Cria uma conta. Por omissão fica PENDENTE e com papel USER — o estado é sempre decidido aqui, no servidor.
 * `privileged` só é usado por código do servidor (primeira conta em /setup, scripts administrativos e testes).
 */
export async function createUser(
  input: { email: string; name: string; password: string },
  privileged?: { role?: UserRole; status?: AccountStatus },
): Promise<AuthUser> {
  const status = privileged?.status ?? "PENDING_APPROVAL";
  const user = await prisma.user.create({
    data: {
      email: input.email.toLowerCase().trim(),
      name: input.name.trim(),
      passwordHash: await hashPassword(input.password),
      role: privileged?.role ?? "USER",
      status,
      approvedAt: status === "APPROVED" ? new Date() : null,
    },
  });
  return toAuthUser(user);
}

export class EmailTakenError extends Error {}

/** Registo público: conta nova, sempre pendente de aprovação e com papel USER (nada vem do browser). */
export async function registerUser(input: { email: string; name: string; password: string }): Promise<AuthUser> {
  const email = input.email.toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new EmailTakenError();
  try {
    return await createUser({ ...input, email });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code?: string }).code === "P2002") throw new EmailTakenError();
    throw e;
  }
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

  // Contas pendentes, rejeitadas ou suspensas também iniciam sessão, mas só veem a página de estado da conta
  const token = newSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.$transaction([
    prisma.session.create({ data: { tokenHash: hashToken(token), userId: user.id, expiresAt, userAgent: meta.userAgent?.slice(0, 255) } }),
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  ]);
  return { ok: true, token, expiresAt, user: toAuthUser(user) };
}

export async function getUserBySessionToken(token: string | undefined | null): Promise<AuthUser | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    // sessão + conta numa só consulta; só os campos necessários (nunca o hash da password)
    select: { id: true, expiresAt: true, user: { select: { id: true, email: true, name: true, role: true, status: true, bannedAt: true, themePreference: true } } },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  return toAuthUser(session.user);
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
