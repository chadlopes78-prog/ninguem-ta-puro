import { prisma } from "@/server/db";
import { Prisma, type Settings } from "@prisma/client";
import type { SettingsInput } from "@/server/validation/schemas";
import type { AuthUser } from "@/server/auth/service";
import { scopeOf, type Scope } from "@/server/scope";

/** Configurações de UMA conta (criadas na primeira utilização). Nunca partilhadas entre contas. */
export async function getSettings(ownerId: string): Promise<Settings> {
  // Caminho rápido: uma só leitura. O upsert (transação com várias idas à BD) só na primeira utilização.
  const existing = await prisma.settings.findUnique({ where: { ownerId } });
  if (existing) return existing;
  try {
    return await prisma.settings.upsert({ where: { ownerId }, create: { ownerId }, update: {} });
  } catch (e) {
    // Dois pedidos em simultâneo: o outro já criou a linha
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return prisma.settings.findUniqueOrThrow({ where: { ownerId } });
    throw e;
  }
}

/**
 * Âmbito de dados do pedido atual: a conta autenticada (aprovada e não suspensa) e o modo real/demonstração
 * dessa conta. Contas sem acesso são redirecionadas antes de qualquer leitura de dados.
 */
export async function getScope(): Promise<{ user: AuthUser; isDemo: boolean; settings: Settings; scope: Scope }> {
  // import dinâmico: este módulo também é usado por scripts de linha de comandos (sem contexto de pedido)
  const { requireUser } = await import("@/server/auth/session");
  const user = await requireUser();
  const settings = await getSettings(user.id);
  return { user, isDemo: settings.demoMode, settings, scope: scopeOf(user.id, settings.demoMode) };
}

export async function updateSettings(ownerId: string, input: SettingsInput): Promise<Settings> {
  await getSettings(ownerId);
  return prisma.settings.update({
    where: { ownerId },
    data: {
      businessName: input.businessName,
      logoUrl: input.logoUrl ?? null,
      ownerName: input.ownerName ?? null,
      ownerEmail: input.ownerEmail ?? null,
      supportEmail: input.supportEmail ?? null,
      defaultCurrency: input.defaultCurrency,
      locale: input.locale,
      timezone: input.timezone,
    },
  });
}

/**
 * Configurações pessoais: nome (na conta) e idioma, moeda padrão e fuso horário (nas configurações da conta).
 * A moeda padrão só se aplica a produtos novos — os preços existentes nunca são alterados.
 */
export async function updateAccountSettings(userId: string, input: import("@/server/validation/schemas").AccountSettingsInput): Promise<void> {
  await getSettings(userId);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { name: input.name } }),
    prisma.settings.update({ where: { ownerId: userId }, data: { locale: input.locale, defaultCurrency: input.defaultCurrency, timezone: input.timezone } }),
  ]);
}

export async function setDemoMode(ownerId: string, enabled: boolean): Promise<Settings> {
  await getSettings(ownerId);
  return prisma.settings.update({ where: { ownerId }, data: { demoMode: enabled } });
}

export function demoToolsEnabled(): boolean {
  return process.env.DEMO_TOOLS_ENABLED === "true";
}
