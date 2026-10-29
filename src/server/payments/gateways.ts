// Configuração dos gateways de pagamento (EPay e E2Payments) POR CONTA.
// - Cada conta tem a sua linha por fornecedor (IntegrationConfig: ownerId + provider). Nada é partilhado entre contas.
// - "enabled" controla apenas NOVOS pagamentos dessa conta; desativar nunca apaga credenciais nem bloqueia confirmações.
// - Credenciais introduzidas na aba Integrações ficam cifradas na BD (secret-box) e nunca são devolvidas ao browser.
// - Variáveis de ambiente (EPAY_SECRET_KEY, E2PAYMENTS_*) são a configuração anterior da plataforma e pertencem
//   EXCLUSIVAMENTE à conta proprietária (OWNER). Nunca servem de recurso para outra conta.
import "server-only";
import type { IntegrationConfig, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { decryptSecret, encryptSecret, secretStorageAvailable } from "@/server/secret-box";
import { staticAppBaseUrl } from "@/server/app-url";
import { createEPayProvider, epayKeyEnvironment } from "./providers/epay";
import { createE2PaymentsProvider, isE2Host, sanitizeCredential, WALLET_ID_RE, type E2Credentials, type E2Host } from "./providers/e2payments";
import { createPagarProvider, pagarBaseUrl, pagarEnvCredentials, pagarKeyEnvironment, validPagarSecret, type PagarCredentials } from "./providers/pagar";
import type { GatewayId, PaymentProvider } from "./types";

/** Estado inicial quando a conta ainda não tem registo: a EPay mantém o comportamento anterior (ativa se configurada). */
const DEFAULT_ENABLED: Record<GatewayId, boolean> = { epay: true, e2payments: false, pagar: false };

export type GatewayStatus = "active" | "inactive" | "credentials_missing" | "config_error" | "unverified";
export const GATEWAY_STATUS_LABELS: Record<GatewayStatus, string> = {
  active: "Ativo",
  inactive: "Inativo",
  credentials_missing: "Credenciais por configurar",
  config_error: "Erro de configuração",
  unverified: "Ligação não verificada",
};

/** Contexto de credenciais de uma conta: as suas linhas e se é a conta proprietária (única com acesso às variáveis). */
export interface GatewayContext {
  ownerId: string;
  isPlatformOwner: boolean;
  rows: Map<string, IntegrationConfig>;
}

export async function gatewayContext(ownerId: string): Promise<GatewayContext> {
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: ownerId }, select: { role: true } }),
    prisma.integrationConfig.findMany({ where: { ownerId, provider: { in: ["epay", "e2payments", "pagar"] } } }),
  ]);
  return { ownerId, isPlatformOwner: user?.role === "OWNER", rows: new Map(rows.map((r) => [r.provider, r])) };
}

export function isEnabled(id: GatewayId, row: IntegrationConfig | undefined): boolean {
  return row ? row.enabled : DEFAULT_ENABLED[id];
}

function readPublic<T extends object>(row: IntegrationConfig | undefined): Partial<T> {
  const p = row?.publicConfig;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as Partial<T>) : {};
}

function readSecretJson<T>(row: IntegrationConfig | undefined, check: (j: Record<string, unknown>) => T | null): T | null {
  const plain = decryptSecret(row?.secretConfig);
  if (!plain) return null;
  try {
    return check(JSON.parse(plain) as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** Credenciais guardadas mas impossíveis de decifrar (ex.: chave do servidor alterada). */
export function secretUnreadable(row: IntegrationConfig | undefined): boolean {
  return Boolean(row?.secretConfig) && decryptSecret(row?.secretConfig) === null;
}

async function log(ownerId: string, provider: string, level: "info" | "warn" | "error", message: string) {
  await prisma.integrationLog.create({ data: { ownerId, provider, level, message: message.slice(0, 500) } });
}

// ───────────── EPay ─────────────

export function epayEnvKey(): string | null {
  const k = process.env.EPAY_SECRET_KEY?.trim();
  return k ? k : null;
}

/** A chave EPay desta conta vem da variável de ambiente (só possível na conta proprietária). */
export function epayFromEnv(ctx: GatewayContext): boolean {
  return ctx.isPlatformOwner && epayEnvKey() !== null;
}

function epayStoredKey(row: IntegrationConfig | undefined): string | null {
  return readSecretJson(row, (j) => (typeof j.secretKey === "string" ? j.secretKey : null));
}

export function buildEPayProvider(ctx: GatewayContext): PaymentProvider {
  if (epayFromEnv(ctx)) return createEPayProvider({ key: epayEnvKey, source: "env" });
  const row = ctx.rows.get("epay");
  return createEPayProvider({ key: () => epayStoredKey(row), source: "panel" });
}

/** Chave secreta EPay desta conta (para mostrar só um fragmento) — nunca sai do servidor completa. */
export function epayKeyForDisplay(ctx: GatewayContext): string | null {
  return epayFromEnv(ctx) ? epayEnvKey() : epayStoredKey(ctx.rows.get("epay"));
}

/** Guarda a chave secreta EPay DESTA conta (cifrada). Não toca na E2Payments nem noutras contas. */
export async function saveEPayCredentials(ctx: GatewayContext, input: { secretKey?: string }): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  if (epayFromEnv(ctx)) return { ok: false, error: "A chave da EPay desta conta está definida na variável EPAY_SECRET_KEY do servidor; altere-a lá." };
  if (!secretStorageAvailable()) return { ok: false, error: "O servidor não tem chave de cifra disponível; as credenciais não foram guardadas." };
  const key = sanitizeCredential(input.secretKey);
  if (!key) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: { secretKey: "Introduza a chave secreta da EPay" } };
  if (!epayKeyEnvironment(key)) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: { secretKey: "A chave secreta da EPay começa por sk_test_ ou sk_live_" } };
  const secretConfig = encryptSecret(JSON.stringify({ secretKey: key }));
  await prisma.integrationConfig.upsert({
    where: { ownerId_provider: { ownerId: ctx.ownerId, provider: "epay" } },
    create: { ownerId: ctx.ownerId, provider: "epay", enabled: false, secretConfig, status: "CONFIGURED", verifiedAt: null, lastError: null },
    update: { secretConfig, status: "CONFIGURED", verifiedAt: null, lastError: null },
  });
  await log(ctx.ownerId, "epay", "info", "Chave secreta atualizada na aba Integrações (valor não registado).");
  return { ok: true };
}

// ───────────── E2Payments ─────────────

interface E2PublicConfig {
  mpesaWalletId?: string | null;
  emolaWalletId?: string | null;
  /** Domínio da E2Payments que aceitou as credenciais no último teste de ligação */
  apiHost?: string | null;
}
interface E2SecretConfig {
  clientId: string;
  clientSecret: string;
}

function envE2(): E2Credentials | null {
  const clientId = sanitizeCredential(process.env.E2PAYMENTS_CLIENT_ID);
  const clientSecret = sanitizeCredential(process.env.E2PAYMENTS_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;
  const wallet = (v: string | undefined) => (v && WALLET_ID_RE.test(v.trim().replace(/^#/, "")) ? v.trim().replace(/^#/, "") : null);
  return { clientId, clientSecret, mpesaWalletId: wallet(process.env.E2PAYMENTS_MPESA_WALLET_ID), emolaWalletId: wallet(process.env.E2PAYMENTS_EMOLA_WALLET_ID), source: "env" };
}

function readE2Secret(row: IntegrationConfig | undefined): E2SecretConfig | null {
  return readSecretJson(row, (j) => (typeof j.clientId === "string" && typeof j.clientSecret === "string" ? { clientId: j.clientId, clientSecret: j.clientSecret } : null));
}

/** As credenciais E2Payments desta conta vêm das variáveis de ambiente (só possível na conta proprietária). */
export function e2FromEnv(ctx: GatewayContext): boolean {
  return ctx.isPlatformOwner && envE2() !== null;
}

export function e2Credentials(ctx: GatewayContext): E2Credentials | null {
  const row = ctx.rows.get("e2payments");
  const pub = readPublic<E2PublicConfig>(row);
  const apiHost = isE2Host(pub.apiHost) ? pub.apiHost : null;
  if (e2FromEnv(ctx)) return { ...envE2()!, apiHost };
  const secret = readE2Secret(row);
  if (!secret) return null;
  return { ...secret, mpesaWalletId: pub.mpesaWalletId ?? null, emolaWalletId: pub.emolaWalletId ?? null, source: "panel", apiHost };
}

async function markConfigError(ownerId: string, id: GatewayId, reason: string) {
  await prisma.integrationConfig.upsert({
    where: { ownerId_provider: { ownerId, provider: id } },
    create: { ownerId, provider: id, enabled: DEFAULT_ENABLED[id], status: "ERROR", lastError: reason, lastCheckedAt: new Date() },
    update: { status: "ERROR", lastError: reason, lastCheckedAt: new Date() },
  });
  await log(ownerId, id, "error", reason);
}

export function buildE2Provider(ctx: GatewayContext) {
  return createE2PaymentsProvider(e2Credentials(ctx), {
    origin: staticAppBaseUrl().url,
    onConfigError: (reason) => markConfigError(ctx.ownerId, "e2payments", reason),
  });
}

/**
 * Guarda as credenciais da E2Payments DESTA conta. O Client Secret só é substituído quando é enviado um novo valor;
 * nunca é devolvido ao browser. Não toca na EPay nem nas credenciais de outras contas.
 */
export async function saveE2Credentials(ctx: GatewayContext, input: { clientId?: string; clientSecret?: string; mpesaWalletId?: string; emolaWalletId?: string }): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  if (e2FromEnv(ctx)) return { ok: false, error: "As credenciais da E2Payments desta conta estão definidas nas variáveis de ambiente do servidor; altere-as lá." };
  if (!secretStorageAvailable()) return { ok: false, error: "O servidor não tem chave de cifra disponível; as credenciais não foram guardadas." };
  const row = ctx.rows.get("e2payments");
  const current = readE2Secret(row);
  const clean = (v: string | undefined) => sanitizeCredential(v);
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
    where: { ownerId_provider: { ownerId: ctx.ownerId, provider: "e2payments" } },
    create: { ownerId: ctx.ownerId, provider: "e2payments", enabled: false, secretConfig, publicConfig, status: "CONFIGURED", verifiedAt: null, lastError: null },
    update: { secretConfig, publicConfig, status: "CONFIGURED", verifiedAt: null, lastError: null },
  });
  await log(ctx.ownerId, "e2payments", "info", "Credenciais atualizadas na aba Integrações (valores não registados).");
  return { ok: true };
}

/** Troca o Client ID e o Client Secret guardados desta conta (quando o teste mostra que foram trocados). */
export async function swapStoredE2Credentials(ctx: GatewayContext): Promise<boolean> {
  const current = readE2Secret(ctx.rows.get("e2payments"));
  if (!current || e2FromEnv(ctx)) return false;
  await prisma.integrationConfig.update({
    where: { ownerId_provider: { ownerId: ctx.ownerId, provider: "e2payments" } },
    data: { secretConfig: encryptSecret(JSON.stringify({ clientId: current.clientSecret, clientSecret: current.clientId } satisfies E2SecretConfig)) },
  });
  await log(ctx.ownerId, "e2payments", "info", "Client ID e Client Secret estavam trocados; corrigidos automaticamente (valores não registados).");
  return true;
}

/** Memoriza o domínio da E2Payments que aceitou as credenciais desta conta. */
export async function rememberE2Host(ctx: GatewayContext, host: E2Host | null): Promise<void> {
  const pub = readPublic<E2PublicConfig>(ctx.rows.get("e2payments"));
  if ((pub.apiHost ?? null) === host) return;
  await prisma.integrationConfig.upsert({
    where: { ownerId_provider: { ownerId: ctx.ownerId, provider: "e2payments" } },
    create: { ownerId: ctx.ownerId, provider: "e2payments", enabled: false, publicConfig: { ...pub, apiHost: host } },
    update: { publicConfig: { ...pub, apiHost: host } },
  });
}

// ───────────── Pagar ─────────────

interface PagarSecretConfig {
  apiKey: string;
  signingSecret: string;
  webhookSecret: string;
}

function readPagarSecret(row: IntegrationConfig | undefined): PagarSecretConfig | null {
  return readSecretJson(row, (j) =>
    typeof j.apiKey === "string" && typeof j.signingSecret === "string" && typeof j.webhookSecret === "string" ? { apiKey: j.apiKey, signingSecret: j.signingSecret, webhookSecret: j.webhookSecret } : null,
  );
}

/** As credenciais da Pagar desta conta vêm das variáveis PAGAR_* (só possível na conta proprietária). */
export function pagarFromEnv(ctx: GatewayContext): boolean {
  return ctx.isPlatformOwner && pagarEnvCredentials() !== null;
}

/** Credenciais da Pagar DESTA conta (variáveis do servidor na conta proprietária, ou guardadas cifradas no painel). */
export function pagarCredentials(ctx: GatewayContext): PagarCredentials | null {
  if (pagarFromEnv(ctx)) return pagarEnvCredentials();
  const secret = readPagarSecret(ctx.rows.get("pagar"));
  return secret ? { ...secret, baseUrl: pagarBaseUrl(), source: "panel" } : null;
}

export function buildPagarProvider(ctx: GatewayContext) {
  return createPagarProvider(pagarCredentials(ctx), {
    onConfigError: (reason) => markConfigError(ctx.ownerId, "pagar", reason),
  });
}

/**
 * Guarda as credenciais da Pagar DESTA conta (cifradas). Um campo deixado em branco mantém o valor guardado; nenhum
 * valor é devolvido ao browser. Não toca na EPay, na E2Payments nem noutras contas.
 */
export async function savePagarCredentials(ctx: GatewayContext, input: { apiKey?: string; signingSecret?: string; webhookSecret?: string }): Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> }> {
  if (pagarFromEnv(ctx)) return { ok: false, error: "As credenciais da Pagar desta conta estão definidas nas variáveis PAGAR_* do servidor; altere-as lá." };
  if (!secretStorageAvailable()) return { ok: false, error: "O servidor não tem chave de cifra disponível; as credenciais não foram guardadas." };
  const current = readPagarSecret(ctx.rows.get("pagar"));
  const clean = (v: string | undefined) => sanitizeCredential(v);
  const apiKey = clean(input.apiKey) || current?.apiKey || "";
  const signingSecret = clean(input.signingSecret) || current?.signingSecret || "";
  const webhookSecret = clean(input.webhookSecret) || current?.webhookSecret || "";
  const fieldErrors: Record<string, string> = {};
  if (!validPagarSecret(apiKey) || !pagarKeyEnvironment(apiKey)) fieldErrors.apiKey = "A API key da Pagar começa por sk_test_ ou sk_live_";
  if (!validPagarSecret(signingSecret)) fieldErrors.signingSecret = "Introduza o signing secret";
  if (!validPagarSecret(webhookSecret)) fieldErrors.webhookSecret = "Introduza o webhook secret";
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors };
  const secretConfig = encryptSecret(JSON.stringify({ apiKey, signingSecret, webhookSecret } satisfies PagarSecretConfig));
  // Credenciais novas exigem nova verificação antes de serem usadas no checkout.
  await prisma.integrationConfig.upsert({
    where: { ownerId_provider: { ownerId: ctx.ownerId, provider: "pagar" } },
    create: { ownerId: ctx.ownerId, provider: "pagar", enabled: false, secretConfig, status: "CONFIGURED", verifiedAt: null, lastError: null },
    update: { secretConfig, status: "CONFIGURED", verifiedAt: null, lastError: null },
  });
  await log(ctx.ownerId, "pagar", "info", "Credenciais da Pagar atualizadas na aba Integrações (valores não registados).");
  return { ok: true };
}

// ───────────── Estado apresentado ─────────────

export function gatewayStatus(id: GatewayId, provider: PaymentProvider, ctx: GatewayContext): GatewayStatus {
  const row = ctx.rows.get(id);
  const fromEnv = id === "epay" ? epayFromEnv(ctx) : id === "pagar" ? pagarFromEnv(ctx) : e2FromEnv(ctx);
  if (!fromEnv && secretUnreadable(row)) return "config_error";
  if (!provider.isConfigured()) {
    // EPay: chave presente mas inválida conta como erro de configuração
    if (id === "epay" && epayKeyForDisplay(ctx)) return "config_error";
    return "credentials_missing";
  }
  if ((id === "e2payments" || id === "pagar") && row?.lastError) return "config_error";
  if (!isEnabled(id, row)) return "inactive";
  // E2Payments e Pagar: só aceitam pagamentos depois de o fornecedor aceitar as credenciais (teste de ligação)
  if ((id === "e2payments" || id === "pagar") && !row?.verifiedAt) return "unverified";
  return "active";
}

/** Disponível para novos pagamentos = ativado + configurado + (E2Payments) ligação verificada e sem erro. */
export function acceptsNewPayments(id: GatewayId, provider: PaymentProvider, ctx: GatewayContext): boolean {
  return gatewayStatus(id, provider, ctx) === "active";
}

export function providerFor(id: GatewayId, ctx: GatewayContext): PaymentProvider {
  return id === "epay" ? buildEPayProvider(ctx) : id === "pagar" ? buildPagarProvider(ctx) : buildE2Provider(ctx);
}
