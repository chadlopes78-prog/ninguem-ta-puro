import { prisma } from "@/server/db";
import { PROVIDER_CATALOG, type GatewayId } from "@/server/payments/types";
import {
  e2CredentialsFromEnv,
  e2Credentials,
  e2SecretUnreadable,
  gatewayRows,
  gatewayStatus,
  isEnabled,
  providerFor,
  saveE2Credentials,
  GATEWAY_STATUS_LABELS,
} from "@/server/payments/gateways";
import { createE2PaymentsProvider } from "@/server/payments/providers/e2payments";
import { secretStorageAvailable, maskSecret } from "@/server/secret-box";
import { DomainError } from "@/server/services/products";

export function isGatewayId(id: string): id is GatewayId {
  return PROVIDER_CATALOG.some((p) => p.id === id);
}

/** Estado de cada gateway para a aba Integrações. Nunca inclui valores de segredos. */
export async function listGateways() {
  const rows = await gatewayRows();
  return PROVIDER_CATALOG.map((p) => {
    const row = rows.get(p.id);
    const provider = providerFor(p.id, rows);
    const status = gatewayStatus(p.id, provider, row);
    const e2 = p.id === "e2payments" ? e2Credentials(row) : null;
    return {
      ...p,
      status,
      statusLabel: GATEWAY_STATUS_LABELS[status],
      enabled: isEnabled(p.id, row),
      configured: provider.isConfigured(),
      checks: provider.configChecks(),
      environment: provider.environment(),
      methods: provider.methods().map((m) => m.label),
      supportsConnectionTest: p.id === "e2payments",
      verifiedAt: row?.verifiedAt ?? null,
      lastCheckedAt: row?.lastCheckedAt ?? null,
      lastError: row?.lastError ?? (p.id === "e2payments" && e2SecretUnreadable(row) ? "As credenciais guardadas não podem ser decifradas (INTEGRATIONS_ENCRYPTION_KEY em falta ou alterada). Introduza-as novamente." : null),
      e2:
        p.id === "e2payments"
          ? {
              fromEnv: e2CredentialsFromEnv(),
              storageAvailable: secretStorageAvailable(),
              clientIdMasked: maskSecret(e2?.clientId),
              hasSecret: Boolean(e2?.clientSecret),
              mpesaWalletId: e2?.mpesaWalletId ?? "",
              emolaWalletId: e2?.emolaWalletId ?? "",
            }
          : null,
    };
  });
}
export type GatewayView = Awaited<ReturnType<typeof listGateways>>[number];

async function log(provider: string, level: "info" | "warn" | "error", message: string) {
  await prisma.integrationLog.create({ data: { provider, level, message: message.slice(0, 500) } });
}

/** Teste de ligação da E2Payments (pedido de token documentado). Atualiza o estado verificado/erro. */
export async function testGatewayConnection(id: GatewayId): Promise<{ ok: boolean; message: string }> {
  if (id !== "e2payments") throw new DomainError("A API da EPay não documenta um teste de ligação. Use “Verificar configuração”.");
  const rows = await gatewayRows();
  const row = rows.get("e2payments");
  // instância sem o gancho de erro: o resultado é tratado aqui
  const provider = createE2PaymentsProvider(e2Credentials(row));
  const r = await provider.testConnection();
  await prisma.integrationConfig.upsert({
    where: { provider: "e2payments" },
    create: { provider: "e2payments", enabled: false, status: r.ok ? "CONFIGURED" : "ERROR", verifiedAt: r.ok ? new Date() : null, lastError: r.ok ? null : r.message, lastCheckedAt: new Date() },
    update: { status: r.ok ? "CONFIGURED" : "ERROR", ...(r.ok ? { verifiedAt: new Date(), lastError: null } : { verifiedAt: null, lastError: r.message }), lastCheckedAt: new Date() },
  });
  await log("e2payments", r.ok ? "info" : "warn", `Teste de ligação: ${r.message}`);
  return r;
}

/**
 * Ativa/desativa um gateway para NOVOS pagamentos. Nunca apaga credenciais, configurações nem histórico,
 * e pagamentos já iniciados continuam a ser confirmados.
 */
export async function setGatewayEnabled(id: GatewayId, enabled: boolean): Promise<{ ok: boolean; message: string }> {
  const rows = await gatewayRows();
  const provider = providerFor(id, rows);
  if (enabled) {
    if (!provider.isConfigured()) {
      return { ok: false, message: id === "epay" ? "Configure primeiro EPAY_SECRET_KEY no servidor." : "Configure primeiro as credenciais da E2Payments." };
    }
    if (id === "e2payments") {
      // Não basta carregar no botão: só fica ativo depois de a E2Payments aceitar as credenciais.
      const t = await testGatewayConnection("e2payments");
      if (!t.ok) return { ok: false, message: `Não foi ativado: ${t.message}` };
    }
  }
  await prisma.integrationConfig.upsert({
    where: { provider: id },
    create: { provider: id, enabled, status: provider.isConfigured() ? "CONFIGURED" : "NOT_CONFIGURED" },
    update: { enabled },
  });
  const name = id === "epay" ? "EPay" : "E2Payments";
  await log(id, "info", enabled ? `${name} ativada para novos pagamentos.` : `${name} desativada para novos pagamentos (credenciais e histórico mantidos).`);
  return { ok: true, message: enabled ? `${name} ativa: passa a aparecer no checkout.` : `${name} desativada. As credenciais e o histórico foram mantidos.` };
}

/** Guarda as credenciais da E2Payments e testa a ligação de imediato. Não altera a EPay. */
export async function updateE2Credentials(input: { clientId?: string; clientSecret?: string; mpesaWalletId?: string; emolaWalletId?: string }) {
  const saved = await saveE2Credentials(input);
  if (!saved.ok) return saved;
  const t = await testGatewayConnection("e2payments");
  return { ok: true as const, message: t.ok ? "Credenciais guardadas e ligação verificada." : `Credenciais guardadas, mas o teste de ligação falhou: ${t.message}` };
}

/** Verificação da configuração no servidor (sem revelar segredos), como antes. */
export async function checkIntegration(providerId: string) {
  if (!isGatewayId(providerId)) throw new Error("Fornecedor desconhecido");
  const rows = await gatewayRows();
  const provider = providerFor(providerId, rows);
  const checks = provider.configChecks();
  const configured = provider.isConfigured();
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  const problem = configured ? null : `Em falta: ${missing.join(", ")}`;
  await prisma.integrationConfig.upsert({
    where: { provider: providerId },
    create: { provider: providerId, enabled: providerId === "epay", status: configured ? "CONFIGURED" : "NOT_CONFIGURED", lastCheckedAt: new Date(), lastError: providerId === "epay" ? problem : undefined },
    // na E2Payments o erro de ligação só é limpo por um teste de ligação bem-sucedido
    update: { status: configured ? "CONFIGURED" : "NOT_CONFIGURED", lastCheckedAt: new Date(), ...(providerId === "epay" ? { lastError: problem } : {}) },
  });
  await log(providerId, configured ? "info" : "warn", problem ?? "Configuração verificada.");
  return { configured, message: problem ?? "Integração configurada." };
}

export async function recentIntegrationLogs() {
  return prisma.integrationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
}
