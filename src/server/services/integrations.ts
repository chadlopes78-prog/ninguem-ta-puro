// Aba Integrações: cada função atua EXCLUSIVAMENTE sobre a conta indicada (sempre a da sessão).
// Nunca devolve segredos completos: só estados e fragmentos não sensíveis.
import { prisma } from "@/server/db";
import { PROVIDER_CATALOG, type GatewayId } from "@/server/payments/types";
import {
  e2Credentials,
  e2FromEnv,
  epayFromEnv,
  epayKeyForDisplay,
  gatewayContext,
  gatewayStatus,
  isEnabled,
  providerFor,
  rememberE2Host,
  saveE2Credentials,
  saveEPayCredentials,
  secretUnreadable,
  swapStoredE2Credentials,
  GATEWAY_STATUS_LABELS,
  type GatewayContext,
} from "@/server/payments/gateways";
import { createE2PaymentsProvider, e2HostLabel } from "@/server/payments/providers/e2payments";
import { epayKeyEnvironment } from "@/server/payments/providers/epay";
import { secretStorageAvailable, maskSecret } from "@/server/secret-box";
import { DomainError } from "@/server/services/products";

export function isGatewayId(id: string): id is GatewayId {
  return PROVIDER_CATALOG.some((p) => p.id === id);
}

const UNREADABLE = "As credenciais guardadas já não podem ser lidas (a chave do servidor mudou, por exemplo após alterar a palavra-passe da base de dados). Introduza-as novamente.";

/** Estado de cada gateway DESTA conta para a aba Integrações. Nunca inclui valores de segredos. */
export async function listGateways(ownerId: string) {
  const ctx = await gatewayContext(ownerId);
  return PROVIDER_CATALOG.map((p) => {
    const row = ctx.rows.get(p.id);
    const provider = providerFor(p.id, ctx);
    const status = gatewayStatus(p.id, provider, ctx);
    const fromEnv = p.id === "epay" ? epayFromEnv(ctx) : e2FromEnv(ctx);
    const e2 = p.id === "e2payments" ? e2Credentials(ctx) : null;
    const epayKey = p.id === "epay" ? epayKeyForDisplay(ctx) : null;
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
      lastError: row?.lastError ?? (!fromEnv && secretUnreadable(row) ? UNREADABLE : null),
      e2:
        p.id === "e2payments"
          ? {
              fromEnv,
              storageAvailable: secretStorageAvailable(),
              clientIdMasked: maskSecret(e2?.clientId),
              hasSecret: Boolean(e2?.clientSecret),
              mpesaWalletId: e2?.mpesaWalletId ?? "",
              emolaWalletId: e2?.emolaWalletId ?? "",
              apiHost: e2?.apiHost ? e2HostLabel(e2.apiHost) : null,
            }
          : null,
      epay:
        p.id === "epay"
          ? {
              fromEnv,
              storageAvailable: secretStorageAvailable(),
              keyMasked: maskSecret(epayKey),
              keyEnvironment: epayKeyEnvironment(epayKey),
            }
          : null,
    };
  });
}
export type GatewayView = Awaited<ReturnType<typeof listGateways>>[number];

async function log(ownerId: string, provider: string, level: "info" | "warn" | "error", message: string) {
  await prisma.integrationLog.create({ data: { ownerId, provider, level, message: message.slice(0, 500) } });
}

async function upsertRow(ctx: GatewayContext, id: GatewayId, create: Record<string, unknown>, update: Record<string, unknown>) {
  await prisma.integrationConfig.upsert({
    where: { ownerId_provider: { ownerId: ctx.ownerId, provider: id } },
    create: { ownerId: ctx.ownerId, provider: id, ...create },
    update,
  });
}

/** Teste de ligação da E2Payments desta conta (pedido de token documentado). Atualiza o estado verificado/erro. */
export async function testGatewayConnection(ownerId: string, id: GatewayId): Promise<{ ok: boolean; message: string }> {
  if (id !== "e2payments") throw new DomainError("A API da EPay não documenta um teste de ligação. Use “Verificar configuração”.");
  const ctx = await gatewayContext(ownerId);
  // instância sem o gancho de erro: o resultado é tratado aqui
  const provider = createE2PaymentsProvider(e2Credentials(ctx));
  let r = await provider.testConnection();
  if (r.ok && r.host) await rememberE2Host(ctx, r.host);
  if (r.ok && r.swapped) {
    // Corrige o que está guardado no painel; nas variáveis de ambiente o dono tem de trocar os valores.
    const fixed = await swapStoredE2Credentials(await gatewayContext(ownerId));
    r = fixed
      ? { ok: true, message: "Ligação verificada. O Client ID e o Client Secret estavam nos campos trocados e foram corrigidos automaticamente." }
      : { ok: false, message: "As credenciais só funcionam trocadas: troque os valores de E2PAYMENTS_CLIENT_ID e E2PAYMENTS_CLIENT_SECRET no alojamento." };
  }
  await upsertRow(
    ctx,
    "e2payments",
    { enabled: false, status: r.ok ? "CONFIGURED" : "ERROR", verifiedAt: r.ok ? new Date() : null, lastError: r.ok ? null : r.message, lastCheckedAt: new Date() },
    { status: r.ok ? "CONFIGURED" : "ERROR", ...(r.ok ? { verifiedAt: new Date(), lastError: null } : { verifiedAt: null, lastError: r.message }), lastCheckedAt: new Date() },
  );
  await log(ownerId, "e2payments", r.ok ? "info" : "warn", `Teste de ligação: ${r.message}`);
  return r;
}

/**
 * Ativa/desativa um gateway DESTA conta para NOVOS pagamentos. Nunca apaga credenciais, configurações nem histórico,
 * pagamentos já iniciados continuam a ser confirmados e as outras contas não são afetadas.
 */
export async function setGatewayEnabled(ownerId: string, id: GatewayId, enabled: boolean): Promise<{ ok: boolean; message: string }> {
  const ctx = await gatewayContext(ownerId);
  const provider = providerFor(id, ctx);
  if (enabled) {
    if (!provider.isConfigured()) {
      return { ok: false, message: id === "epay" ? "Configure primeiro a chave secreta da EPay." : "Configure primeiro as credenciais da E2Payments." };
    }
    if (id === "e2payments") {
      // Não basta carregar no botão: só fica ativo depois de a E2Payments aceitar as credenciais.
      const t = await testGatewayConnection(ownerId, "e2payments");
      if (!t.ok) return { ok: false, message: `Não foi ativado: ${t.message}` };
    }
  }
  await upsertRow(ctx, id, { enabled, status: provider.isConfigured() ? "CONFIGURED" : "NOT_CONFIGURED" }, { enabled });
  const name = id === "epay" ? "EPay" : "E2Payments";
  await log(ownerId, id, "info", enabled ? `${name} ativada para novos pagamentos.` : `${name} desativada para novos pagamentos (credenciais e histórico mantidos).`);
  return { ok: true, message: enabled ? `${name} ativa: passa a aparecer nos seus checkouts.` : `${name} desativada. As credenciais e o histórico foram mantidos.` };
}

/** Guarda as credenciais da E2Payments desta conta e testa a ligação de imediato. Não altera a EPay. */
export async function updateE2Credentials(ownerId: string, input: { clientId?: string; clientSecret?: string; mpesaWalletId?: string; emolaWalletId?: string }) {
  const saved = await saveE2Credentials(await gatewayContext(ownerId), input);
  if (!saved.ok) return saved;
  const t = await testGatewayConnection(ownerId, "e2payments");
  return { ok: true as const, message: t.ok ? "Credenciais guardadas e ligação verificada." : `Credenciais guardadas, mas o teste de ligação falhou: ${t.message}` };
}

/**
 * Guarda a chave secreta da EPay desta conta. A API da EPay não documenta um teste de ligação: a chave fica
 * "configurada" (formato válido), nunca apresentada como "verificada". Não altera a E2Payments nem outras contas.
 */
export async function updateEPayCredentials(ownerId: string, input: { secretKey?: string }) {
  const saved = await saveEPayCredentials(await gatewayContext(ownerId), input);
  if (!saved.ok) return saved;
  return { ok: true as const, message: "Chave guardada (cifrada). Ative a EPay para a usar nos seus checkouts. A EPay não oferece um teste de ligação: confirme com um pagamento de teste (chave sk_test_)." };
}

/** Verificação da configuração no servidor (sem revelar segredos). */
export async function checkIntegration(ownerId: string, providerId: string) {
  if (!isGatewayId(providerId)) throw new Error("Fornecedor desconhecido");
  const ctx = await gatewayContext(ownerId);
  const provider = providerFor(providerId, ctx);
  const checks = provider.configChecks();
  const configured = provider.isConfigured();
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  const problem = configured ? null : `Em falta: ${missing.join(", ")}`;
  await upsertRow(
    ctx,
    providerId,
    { enabled: providerId === "epay", status: configured ? "CONFIGURED" : "NOT_CONFIGURED", lastCheckedAt: new Date(), lastError: providerId === "epay" ? problem : undefined },
    // na E2Payments o erro de ligação só é limpo por um teste de ligação bem-sucedido
    { status: configured ? "CONFIGURED" : "NOT_CONFIGURED", lastCheckedAt: new Date(), ...(providerId === "epay" ? { lastError: problem } : {}) },
  );
  await log(ownerId, providerId, configured ? "info" : "warn", problem ?? "Configuração verificada.");
  return { configured, message: problem ?? "Integração configurada." };
}

export async function recentIntegrationLogs(ownerId: string) {
  return prisma.integrationLog.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, take: 20 });
}

/** Estado das integrações de uma conta para a Administração: só estados, nunca segredos nem fragmentos. */
export async function integrationStatesForAdmin(ownerId: string) {
  const views = await listGateways(ownerId);
  return views.map((v) => ({ id: v.id, name: v.name, status: v.status, statusLabel: v.statusLabel, enabled: v.enabled, configured: v.configured, environment: v.environment, verifiedAt: v.verifiedAt }));
}
