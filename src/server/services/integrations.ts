import { prisma } from "@/server/db";
import { PROVIDER_CATALOG } from "@/server/payments/types";
import { getProvider } from "@/server/payments/registry";
import { EPAY_CONTRACT } from "@/server/payments/providers/epay";

export async function listIntegrations() {
  const configs = await prisma.integrationConfig.findMany();
  return PROVIDER_CATALOG.map((p) => {
    const cfg = configs.find((c) => c.provider === p.id);
    const provider = getProvider(p.id);
    return {
      ...p,
      configured: provider?.isConfigured() ?? false,
      checks: provider?.configChecks() ?? [],
      pendingContract: p.id === "epay" && !EPAY_CONTRACT.confirmed ? [...EPAY_CONTRACT.pending] : [],
      lastCheckedAt: cfg?.lastCheckedAt ?? null,
      lastError: cfg?.lastError ?? null,
    };
  });
}

/** Verifica a configuração sem revelar segredos e regista o resultado. */
export async function checkIntegration(providerId: string) {
  const provider = getProvider(providerId);
  if (!provider || !PROVIDER_CATALOG.some((p) => p.id === providerId)) throw new Error("Fornecedor desconhecido");
  const checks = provider.configChecks();
  const configured = provider.isConfigured();
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  const lastError = configured ? null : `Em falta: ${missing.join(", ")}`;
  await prisma.integrationConfig.upsert({
    where: { provider: providerId },
    create: { provider: providerId, status: configured ? "CONFIGURED" : "NOT_CONFIGURED", lastCheckedAt: new Date(), lastError },
    update: { status: configured ? "CONFIGURED" : "NOT_CONFIGURED", lastCheckedAt: new Date(), lastError },
  });
  await prisma.integrationLog.create({ data: { provider: providerId, level: configured ? "info" : "warn", message: lastError ?? "Configuração verificada." } });
  return { configured, message: lastError ?? "Integração configurada." };
}

export async function recentIntegrationLogs() {
  return prisma.integrationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
}
