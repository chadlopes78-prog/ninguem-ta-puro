import { prisma } from "@/server/db";
import { Prisma, type Settings } from "@prisma/client";
import type { SettingsInput } from "@/server/validation/schemas";

export async function getSettings(): Promise<Settings> {
  try {
    return await prisma.settings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
  } catch (e) {
    // Dois pedidos em simultâneo numa base de dados nova: o outro já criou a linha
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return prisma.settings.findUniqueOrThrow({ where: { id: "default" } });
    throw e;
  }
}

/** Âmbito de dados atual: modo de demonstração ou dados reais. Nunca misturados. */
export async function getScope(): Promise<{ isDemo: boolean; settings: Settings }> {
  const settings = await getSettings();
  return { isDemo: settings.demoMode, settings };
}

export async function updateSettings(input: SettingsInput): Promise<Settings> {
  await getSettings();
  return prisma.settings.update({
    where: { id: "default" },
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

export async function setDemoMode(enabled: boolean): Promise<Settings> {
  await getSettings();
  return prisma.settings.update({ where: { id: "default" }, data: { demoMode: enabled } });
}

export function demoToolsEnabled(): boolean {
  return process.env.DEMO_TOOLS_ENABLED === "true";
}
