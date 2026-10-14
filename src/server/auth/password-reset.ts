// Redefinição de palavra-passe com token temporário:
//  - só o hash SHA-256 do token é guardado; validade de 30 minutos; uso único;
//  - pedir um novo token invalida os anteriores; no máximo 3 pedidos por conta por hora;
//  - a resposta ao pedido é sempre igual (não revela se o email existe);
//  - redefinir termina todas as sessões da conta.
import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "@/server/db";
import { hashToken } from "./tokens";
import { hashPassword } from "./password";
import { emailConfigured, sendEmail } from "@/server/email";

export const RESET_TTL_MS = 30 * 60_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;

async function issueToken(userId: string, now: Date): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    // um único link válido de cada vez
    prisma.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } }),
    prisma.passwordResetToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + RESET_TTL_MS) } }),
  ]);
  return token;
}

export function resetUrl(baseUrl: string, token: string) {
  return `${baseUrl}/redefinir/${token}`;
}

/**
 * Pedido de recuperação (público). Devolve se o envio por email está disponível — nunca se a conta existe.
 */
export async function requestPasswordReset(emailInput: string, baseUrl: string, now = new Date()): Promise<{ emailAvailable: boolean }> {
  const emailAvailable = emailConfigured();
  const email = emailInput.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (!user || !emailAvailable) return { emailAvailable };
  const recent = await prisma.passwordResetToken.count({ where: { userId: user.id, createdAt: { gt: new Date(now.getTime() - 60 * 60_000) } } });
  if (recent >= 3) return { emailAvailable };
  const token = await issueToken(user.id, now);
  const link = resetUrl(baseUrl, token);
  await sendEmail({
    to: user.email,
    subject: "Redefinir a palavra-passe — Ninguém Tá Puro",
    text: `Olá ${user.name},\n\nRecebemos um pedido para redefinir a sua palavra-passe. Abra este link nos próximos 30 minutos:\n${link}\n\nSe não fez este pedido, ignore este email: a sua palavra-passe não muda.`,
    html: `<p>Olá ${user.name.replace(/[<>&"]/g, "")},</p><p>Recebemos um pedido para redefinir a sua palavra-passe. O link é válido durante 30 minutos:</p><p><a href="${link}">Redefinir a palavra-passe</a></p><p>Se não fez este pedido, ignore este email: a sua palavra-passe não muda.</p>`,
  });
  return { emailAvailable };
}

/** Link gerado pelo proprietário da plataforma (Administração) quando o email não está configurado. */
export async function createResetLinkForUser(userId: string, baseUrl: string, now = new Date()): Promise<string> {
  return resetUrl(baseUrl, await issueToken(userId, now));
}

export async function checkResetToken(token: string, now = new Date()): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const t = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, select: { usedAt: true, expiresAt: true } });
  return Boolean(t && !t.usedAt && t.expiresAt > now);
}

/** Define a nova palavra-passe. Falha se o token for inválido, expirado ou já usado (corrida incluída). */
export async function resetPassword(token: string, newPassword: string, now = new Date()): Promise<boolean> {
  if (!TOKEN_RE.test(token)) return false;
  const t = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!t || t.usedAt || t.expiresAt <= now) return false;
  const passwordHash = await hashPassword(newPassword);
  return prisma.$transaction(async (tx) => {
    const used = await tx.passwordResetToken.updateMany({ where: { id: t.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (used.count !== 1) return false;
    await tx.user.update({ where: { id: t.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: t.userId } });
    return true;
  });
}
