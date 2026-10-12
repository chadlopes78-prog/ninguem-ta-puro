import { prisma } from "@/server/db";
import { PROVIDER_CATALOG } from "@/server/payments/types";
import { getProvider } from "@/server/payments/registry";

export async function listIntegrations() {
  const configs = await prisma.integrationConfig.findMany();
  return PROVIDER_CATALOG.map((p) => {
    const cfg = configs.find((c) => c.provider === p.id);
    const implemented = getProvider(p.id) !== null;
    return {
      ...p,
      implemented,
      status: cfg?.status ?? "NOT_CONFIGURED",
      environment: cfg?.environment ?? "SANDBOX",
      lastCheckedAt: cfg?.lastCheckedAt ?? null,
      lastError: cfg?.lastError ?? null,
    };
  });
}

/** Verifica o estado real de um fornecedor. Nunca o marca como ligado sem implementação e credenciais válidas. */
export async function checkIntegration(providerId: string) {
  if (!PROVIDER_CATALOG.some((p) => p.id === providerId)) throw new Error("Fornecedor desconhecido");
  const provider = getProvider(providerId);
  const configured = provider?.isConfigured() ?? false;
  const lastError = provider ? (configured ? null : "Credenciais em falta nas variáveis de ambiente.") : "Integração ainda não implementada nesta versão.";
  const status = configured ? "CONFIGURED" : "NOT_CONFIGURED";
  await prisma.integrationConfig.upsert({
    where: { provider: providerId },
    create: { provider: providerId, status, lastCheckedAt: new Date(), lastError },
    update: { status, lastCheckedAt: new Date(), lastError },
  });
  await prisma.integrationLog.create({ data: { provider: providerId, level: configured ? "info" : "warn", message: lastError ?? "Verificação concluída" } });
  return { configured, message: lastError ?? "Integração verificada." };
}

export async function recentIntegrationLogs() {
  return prisma.integrationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
}
