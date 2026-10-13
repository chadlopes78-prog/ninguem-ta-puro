// Configuração de cada gateway de pagamento (EPay e E2Payments), independente entre si.
// - "enabled" controla apenas NOVOS pagamentos; desativar nunca apaga credenciais nem bloqueia confirmações.
// - EPay: credenciais exclusivamente em variáveis de ambiente (EPAY_SECRET_KEY) — esta camada nunca as altera.
// - E2Payments: credenciais introduzidas na aba Integrações (cifradas na BD) ou variáveis de ambiente (prioritárias).
import "server-only";
import type { IntegrationConfig, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { decryptSecret, encryptSecret, secretStorageAvailable } from "@/server/secret-box";
import { staticAppBaseUrl } from "@/server/app-url";
import { epayProvider } from "./providers/epay";
import { createE2PaymentsProvider, WALLET_ID_RE, type E2Credentials } from "./providers/e2payments";
import type { GatewayId, PaymentProvider } from "./types";

/** Estado inicial quando ainda não existe registo: a EPay mantém o comportamento atual (ativa). */
const DEFAULT_ENABLED: Record<GatewayId, boolean> = { epay: true, e2payments: false };

export type GatewayStatus = "active" | "inactive" | "credentials_missing" | "config_error" | "unverified";
export const GATEWAY_STATUS_LABELS: Record<GatewayStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  credentials_missing: "Credenciais por configurar",
  config_error: "Erro de configuração",
  unverified: "Ligação não verificada",
};

export async function gatewayRows(): Promise<Map<string, IntegrationConfig>> {
  const rows = await prisma.integrationConfig.findMany({ where: { provider: { in: ["epay", "e2payments"] } } });
  return new Map(rows.map((r) => [r.provider, r]));
}

export function isEnabled(id: GatewayId, row: IntegrationConfig | undefined): boolean {
  return row ? row.enabled : DEFAULT_ENABLED[id];
}

// ───────────── Credenciais E2Payments ─────────────

interface E2PublicConfig {
  mpesaWalletId?: string | null;
  emolaWalletId?: string | null;
}
interface E2SecretConfig {
  clientId: string;
  clientSecret: string;
}

function envE2(): E2Credentials | null {
  const clientId = process.env.E2PAYMENTS_CLIENT_ID?.trim();
  const clientSecret = process.env.E2PAYMENTS_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const wallet = (v: string | undefined) => (v && WALLET_ID_RE.test(v.trim().replace(/^#/, "")) ? v.trim().replace(/^#/, "") : null);
  return { clientId, clientSecret, mpesaWalletId: wallet(process.env.E2PAYMENTS_MPESA_WALLET_ID), emolaWalletId: wallet(process.env.E2PAYMENTS_EMOLA_WALLET_ID), source: "env" };
}

function readPublic(row: IntegrationConfig | undefined): E2PublicConfig {
  const p = row?.publicConfig;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as E2PublicConfig) : {};
}

function readSecret(row: IntegrationConfig | undefined): E2SecretConfig | null {
  const plain = decryptSecret(row?.secretConfig);
  if (!plain) return null;
  try {
    const j = JSON.parse(plain) as Partial<E2SecretConfig>;
    return typeof j.clientId === "string" && typeof j.clientSecret === "string" ? { clientId: j.clientId, clientSecret: j.clientSecret } : null;
  } catch {
    return null;
  }
}

export function e2Credentials(row: IntegrationConfig | undefined): E2Credentials | null {
  const env = envE2();
  if (env) return env;
  const secret = readSecret(row);
  if (!secret) return null;
  const pub = readPublic(row);
  return { ...secret, mpesaWalletId: pub.mpesaWalletId ?? null, emolaWalletId: pub.emolaWalletId ?? null, source: "panel" };
}

export function e2CredentialsFromEnv(): boolean {
  return envE2() !== null;
}

/** Credenciais guardadas mas impossíveis de decifrar (ex.: INTEGRATIONS_ENCRYPTION_KEY alterada ou removida). */
export function e2SecretUnreadable(row: IntegrationConfig | undefined): boolean {
  return Boolean(row?.secretConfig) && readSecret(row) === null;
}

async function markConfigError(id: GatewayId, reason: string) {
  await prisma.integrationConfig.upsert({
    where: { provider: id },
    create: { provider: id, enabled: DEFAULT_ENABLED[id], status: "ERROR", lastError: reason, lastCheckedAt: new Date() },
    update: { status: "ERROR", lastError: reason, lastCheckedAt: new Date() },
  });
  await prisma.integrationLog.create({ data: { provider: id, level: "error", message: reason } });
}

export function buildE2Provider(row: IntegrationConfig | undefined) {
  return createE2PaymentsProvider(e2Credentials(row), {
    origin: staticAppBaseUrl().url,
    onConfigError: (reason) => markConfigError("e2payments", reason),
  });
}

/**
 * Guarda as credenciais da E2Payments introduzidas no painel. O Client Secret só é substituído quando é
 * enviado um novo valor; nunca é devolvido ao browser. Não toca na configuração da EPay.
 */
export async function saveE2Credentials(input: { clientId?: string; clientSecret?: string; mpesaWalletId?: string; emolaWalletId?: string }): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  if (e2CredentialsFromEnv()) return { ok: false, error: "As credenciais da E2Payments estão definidas nas variáveis de ambiente do servidor; altere-as lá." };
  if (!secretStorageAvailable()) return { ok: false, error: "O servidor não tem chave de cifra disponível; as credenciais não foram guardadas." };
  const rows = await gatewayRows();
  const row = rows.get("e2payments");
  const current = readSecret(row);
  const clean = (v: string | undefined) => (v ?? "").trim();
  const wallet = (v: string | undefined) => clean(v).replace(/^#/, "");
  const clientId = clean(input.clientId) || current?.clientId || "";
  const clientSecret = clean(input.clientSecret) || current?.clientSecret || "";
  const mpesa = wallet(input.mpesaWalletId);
  const emola = wallet(input.emolaWalletId);

  const fieldErrors: Record<string, string> = {};
  if (!clientId || clientId.length > 200 || /\s/.test(clientId)) fieldErrors.clientId = "Introduza o Client ID";
  if (!clientSecret || clientSecret.length > 300 || /\s/.test(clientSecret)) fieldErrors.clientSecret = "Introduza o Client Secret";
  if (mpesa && !WALLET_ID_RE.test(mpesa)) fieldErrors.mpesaWalletId = "Apenas números (sem #)";
  if (emola && !WALLET_ID_RE.test(emola)) fieldErrors.emolaWalletId = "Apenas números (sem #)";
  if (!mpesa && !emola) fieldErrors.mpesaWalletId = "Indique pelo menos uma carteira (M-Pesa ou e-Mola)";
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors };

  const secretConfig = encryptSecret(JSON.stringify({ clientId, clientSecret } satisfies E2SecretConfig));
  const publicConfig: Prisma.InputJsonValue = { mpesaWalletId: mpesa || null, emolaWalletId: emola || null };
  // Credenciais novas exigem novo teste de ligação antes de voltarem a ser usadas no checkout.
  await prisma.integrationConfig.upsert({
    where: { provider: "e2payments" },
    create: { provider: "e2payments", enabled: false, secretConfig, publicConfig, status: "CONFIGURED", verifiedAt: null, lastError: null },
    update: { secretConfig, publicConfig, status: "CONFIGURED", verifiedAt: null, lastError: null },
  });
  await prisma.integrationLog.create({ data: { provider: "e2payments", level: "info", message: "Credenciais atualizadas na aba Integrações (valores não registados)." } });
  return { ok: true };
}

// ───────────── Estado apresentado ─────────────

export function gatewayStatus(id: GatewayId, provider: PaymentProvider, row: IntegrationConfig | undefined): GatewayStatus {
  if (id === "e2payments" && e2SecretUnreadable(row) && !e2CredentialsFromEnv()) return "config_error";
  if (!provider.isConfigured()) {
    // EPay: chave presente mas inválida conta como erro de configuração
    if (id === "epay" && process.env.EPAY_SECRET_KEY?.trim()) return "config_error";
    return "credentials_missing";
  }
  if (id === "e2payments" && row?.lastError) return "config_error";
  if (!isEnabled(id, row)) return "inactive";
  if (id === "e2payments" && !row?.verifiedAt) return "unverified";
  return "active";
}

/** Disponível para novos pagamentos = ativado + configurado + (E2Payments) ligação verificada e sem erro. */
export function acceptsNewPayments(id: GatewayId, provider: PaymentProvider, row: IntegrationConfig | undefined): boolean {
  return gatewayStatus(id, provider, row) === "active";
}

export function providerFor(id: GatewayId, rows: Map<string, IntegrationConfig>): PaymentProvider {
  return id === "epay" ? epayProvider : buildE2Provider(rows.get("e2payments"));
}
