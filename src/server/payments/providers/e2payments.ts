// Integração E2Payments (Explicador, Moçambique) — M-Pesa e e-Mola por pedido de confirmação no telemóvel.
//
// Fontes (ver docs/e2payments-api.md): SDK PHP oficial "Explicador/e2Payments-php-sdk" e aplicação de exemplo
// oficial "Explicador/Mpesa-eMola-e2PaymentsApp", ambos publicados pela Explicador e baseados na API REST
// documentada em https://e2payments.explicador.co.mz/docs. Nada aqui foi inventado:
//   1. POST {base}/oauth/token  JSON {grant_type:"client_credentials", client_id, client_secret} → {token_type, access_token}
//   2. POST {base}/v1/c2b/mpesa-payment/{wallet_id}  ou  /v1/c2b/emola-payment/{wallet_id}
//      cabeçalhos Authorization: "<token_type> <access_token>", Content-Type/Accept: application/json
//      corpo {client_id, amount, phone, reference}
//      200/201 = transação executada com sucesso; 400 = problema de carteira/origem/M-Pesa;
//      401 = credenciais; 403 = carteira inexistente ou sem acesso; 500 = erro do servidor.
// A chamada é síncrona: só responde depois de o comprador confirmar (ou recusar) no telemóvel.
// Não há notificações (webhooks) nem consulta de estado documentadas — por isso:
//   - só um 200/201 da chamada autenticada servidor-a-servidor confirma o pagamento;
//   - tempo esgotado, falha de rede ou 5xx deixam o pagamento "por verificar" (nunca pago automaticamente).
//
// Segredos: client_secret só existe no servidor (variável de ambiente ou cifrado na BD), nunca em logs nem no browser.
import "server-only";
import type { ChargeRequest, ChargeResult, ConfigCheck, PaymentMethodOption, PaymentProvider } from "../types";

export const E2PAYMENTS_BASE_URL = "https://e2payments.explicador.co.mz";
const TOKEN_TIMEOUT_MS = 20_000;
/** O SDK oficial espera até 180 s pela confirmação no telemóvel; ficamos ligeiramente abaixo. */
export const E2PAYMENTS_CHARGE_TIMEOUT_MS = 170_000;

export interface E2Credentials {
  clientId: string;
  clientSecret: string;
  /** IDs das carteiras (sem o "#"), como aparecem no painel E2Payments */
  mpesaWalletId: string | null;
  emolaWalletId: string | null;
  source: "env" | "panel";
}

export type E2Method = "mpesa" | "emola";

const METHODS: Record<E2Method, PaymentMethodOption & { path: string }> = {
  // Prefixos indicados na aplicação de exemplo oficial (M-Pesa 84/85, e-Mola 86/87)
  mpesa: { id: "mpesa", label: "M-Pesa", requiresPhone: true, phonePrefixes: ["84", "85"], path: "mpesa-payment" },
  emola: { id: "emola", label: "e-Mola", requiresPhone: true, phonePrefixes: ["86", "87"], path: "emola-payment" },
};

export const WALLET_ID_RE = /^\d{1,20}$/;

/** Referência enviada à carteira: alfanumérica, como nos exemplos oficiais (ex.: "NTP-AB12CD34" → "NTPAB12CD34"). */
export function e2Reference(orderCode: string): string {
  return orderCode.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || "NinguemTaPuro";
}

/** Valor em meticais (o exemplo oficial envia o número introduzido pelo utilizador). */
export function e2Amount(amountCents: number): number {
  return amountCents % 100 === 0 ? amountCents / 100 : Number((amountCents / 100).toFixed(2));
}

/**
 * Limpa um valor colado do painel: espaços (incl. não separáveis), caracteres invisíveis e aspas à volta.
 * Copiar de páginas web ou mensagens acrescenta muitas vezes estes caracteres, que fazem a E2Payments rejeitar a credencial.
 */
export function sanitizeCredential(v: string | null | undefined): string {
  return (v ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\u00A0/g, " ")
    .trim()
    .replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "")
    .trim();
}

/** Erro devolvido pelo servidor OAuth (ex.: "invalid_client: Client authentication failed"). Nunca contém segredos. */
function oauthError(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const parts = [j.error, j.error_description ?? j.message, j.hint].filter((x): x is string => typeof x === "string" && x.length > 0);
  return parts.length ? [...new Set(parts)].join(": ").slice(0, 200) : null;
}

function apiMessage(json: unknown): string | null {
  return json && typeof json === "object" && "message" in json && typeof (json as { message: unknown }).message === "string" ? (json as { message: string }).message.slice(0, 200) : null;
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export type TokenResult = { ok: true; authorization: string } | { ok: false; status: number | null; reason: string };

/**
 * Formas de enviar as credenciais ao servidor OAuth da E2Payments (/oauth/token, grant client_credentials).
 * 1. JSON no corpo — a forma dos exemplos oficiais (SDK PHP e aplicação de exemplo);
 * 2. formulário (application/x-www-form-urlencoded) — a forma da especificação OAuth 2.0 (RFC 6749 §4.4);
 * 3. HTTP Basic (client_id:client_secret) — a outra forma de autenticação de cliente da RFC 6749 §2.3.1.
 * Tenta-se a seguinte só quando a anterior é recusada (400/401); o primeiro sucesso é usado.
 */
const TOKEN_VARIANTS = ["json", "form", "basic"] as const;
type TokenVariant = (typeof TOKEN_VARIANTS)[number];

function tokenRequest(variant: TokenVariant, creds: Pick<E2Credentials, "clientId" | "clientSecret">): RequestInit {
  const base = { method: "POST", signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS), cache: "no-store" as const };
  if (variant === "json") {
    return { ...base, headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ grant_type: "client_credentials", client_id: creds.clientId, client_secret: creds.clientSecret }) };
  }
  if (variant === "form") {
    return { ...base, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "client_credentials", client_id: creds.clientId, client_secret: creds.clientSecret }).toString() };
  }
  const basic = Buffer.from(`${encodeURIComponent(creds.clientId)}:${encodeURIComponent(creds.clientSecret)}`).toString("base64");
  return { ...base, headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: `Basic ${basic}` }, body: new URLSearchParams({ grant_type: "client_credentials" }).toString() };
}

async function requestTokenVariant(variant: TokenVariant, creds: Pick<E2Credentials, "clientId" | "clientSecret">): Promise<TokenResult> {
  let res: Response;
  try {
    res = await fetch(`${E2PAYMENTS_BASE_URL}/oauth/token`, tokenRequest(variant, creds));
  } catch (e) {
    return { ok: false, status: null, reason: e instanceof Error && e.name === "TimeoutError" ? "tempo de resposta excedido" : "falha de rede" };
  }
  const json = await readJson(res);
  if (res.status !== 200) return { ok: false, status: res.status, reason: oauthError(json) ?? `HTTP ${res.status}` };
  const j = (json ?? {}) as { token_type?: unknown; access_token?: unknown };
  if (typeof j.access_token !== "string" || !j.access_token) return { ok: false, status: 200, reason: "resposta de autenticação sem token" };
  // token_type documentado como "Bearer"; se faltar, usa-se Bearer (tipo do único esquema OAuth descrito)
  return { ok: true, authorization: `${typeof j.token_type === "string" && j.token_type ? j.token_type : "Bearer"} ${j.access_token}` };
}

export async function requestToken(creds: Pick<E2Credentials, "clientId" | "clientSecret">): Promise<TokenResult> {
  let first: TokenResult | null = null;
  for (const v of TOKEN_VARIANTS) {
    const r = await requestTokenVariant(v, creds);
    if (r.ok) return r;
    first ??= r;
    // só faz sentido tentar outra forma quando o servidor recusou as credenciais
    if (r.status !== 400 && r.status !== 401) return r;
  }
  return first!;
}

/**
 * Valores que nunca podem funcionar: o segredo copiado mascarado (••••, ****) ou já cifrado/hash
 * (ex.: "$2y$10$…", que o painel pode mostrar depois de criada a credencial).
 */
export function credentialProblem(creds: Pick<E2Credentials, "clientId" | "clientSecret">): string | null {
  for (const [label, v] of [["Client ID", creds.clientId], ["Client Secret", creds.clientSecret]] as const) {
    if (/[•*…]/.test(v)) return `O ${label} parece ter sido copiado mascarado (com • ou *). Copie o valor completo no painel da E2Payments.`;
    if (/^\$2[aby]\$\d{2}\$/.test(v)) return `O ${label} colado é um valor cifrado (começa por "$2y$"), não a credencial. No painel da E2Payments, gere uma nova credencial e copie o segredo no momento em que é mostrado.`;
  }
  return null;
}

export interface E2ProviderHooks {
  /** Chamado quando a E2Payments rejeita as credenciais ou a carteira (401/403): o gateway sai do checkout até novo teste. */
  onConfigError?: (reason: string) => Promise<void>;
  /** Endereço do site, enviado como Origin tal como no SDK oficial. */
  origin?: string | null;
}

export interface ConnectionTest {
  ok: boolean;
  message: string;
  /** As credenciais só funcionam com o Client ID e o Client Secret trocados (foram colados nos campos errados). */
  swapped?: boolean;
}

export function createE2PaymentsProvider(creds: E2Credentials | null, hooks: E2ProviderHooks = {}): PaymentProvider & { testConnection(): Promise<ConnectionTest> } {
  const wallets = (): E2Method[] => (["mpesa", "emola"] as const).filter((m) => (m === "mpesa" ? creds?.mpesaWalletId : creds?.emolaWalletId));
  const configured = () => Boolean(creds?.clientId && creds.clientSecret && wallets().length > 0);

  return {
    id: "e2payments",
    displayName: "E2Payments",
    supportedCurrencies: ["MZN"],
    checkoutMode: "direct",
    acceptsWebhooks: false,
    // A documentação não indica um ambiente de testes separado: as credenciais são de produção.
    environment: () => (configured() ? "live" : null),
    isConfigured: configured,

    configChecks(): ConfigCheck[] {
      const from = creds?.source === "env" ? "variável de ambiente do servidor" : "guardado na aba Integrações (cifrado)";
      return [
        { label: "Client ID", ok: Boolean(creds?.clientId), detail: creds?.clientId ? `Definido (${from})` : "Em falta" },
        { label: "Client Secret", ok: Boolean(creds?.clientSecret), detail: creds?.clientSecret ? `Definido (${from}); nunca é apresentado` : "Em falta" },
        { label: "Carteira M-Pesa", ok: Boolean(creds?.mpesaWalletId), detail: creds?.mpesaWalletId ? `#${creds.mpesaWalletId}` : "Não definida (M-Pesa indisponível)" },
        { label: "Carteira e-Mola", ok: Boolean(creds?.emolaWalletId), detail: creds?.emolaWalletId ? `#${creds.emolaWalletId}` : "Não definida (e-Mola indisponível)" },
      ];
    },

    methods: () => wallets().map((m) => {
      const { path: _path, ...opt } = METHODS[m];
      void _path;
      return opt;
    }),

    async testConnection(): Promise<ConnectionTest> {
      if (!creds?.clientId || !creds.clientSecret) return { ok: false, message: "Introduza o Client ID e o Client Secret." };
      if (wallets().length === 0) return { ok: false, message: "Indique pelo menos uma carteira (M-Pesa ou e-Mola)." };
      const problem = credentialProblem(creds);
      if (problem) return { ok: false, message: problem };
      const t = await requestToken(creds);
      if (t.ok) return { ok: true, message: "Ligação verificada: a E2Payments aceitou as credenciais." };
      if (t.status === 401 || t.status === 400) {
        // Engano frequente: Client ID e Client Secret colados nos campos trocados. Testa-se a combinação inversa.
        const swapped = await requestToken({ clientId: creds.clientSecret, clientSecret: creds.clientId });
        if (swapped.ok) return { ok: true, swapped: true, message: "Ligação verificada. O Client ID e o Client Secret estavam nos campos trocados." };
        return {
          ok: false,
          message: `A E2Payments rejeitou as credenciais (HTTP ${t.status}${t.reason && t.reason !== `HTTP ${t.status}` ? ` — ${t.reason}` : ""}). Já foram testados o envio em JSON, em formulário e por autenticação HTTP Basic, e também com os campos trocados. Confirme no painel da E2Payments (Credenciais) que o Client ID e o Client Secret pertencem à mesma credencial e que esta está ativa; em caso de dúvida, gere uma nova credencial e cole os dois valores.`,
        };
      }
      return { ok: false, message: `Não foi possível contactar a E2Payments (${t.status ? `HTTP ${t.status}` : t.reason}). Tente novamente.` };
    },

    async createCharge(req: ChargeRequest): Promise<ChargeResult> {
      const m = req.method as E2Method | null;
      const wallet = m === "mpesa" ? creds?.mpesaWalletId : m === "emola" ? creds?.emolaWalletId : null;
      if (!creds || !m || !METHODS[m] || !wallet || !req.phone) {
        return { kind: "not_created", reason: "método ou carteira indisponível", userMessage: "Este método de pagamento não está disponível. Escolha outro." };
      }
      if (req.currency !== "MZN") return { kind: "not_created", reason: "moeda não suportada", userMessage: "Moeda não suportada." };

      const token = await requestToken(creds);
      if (!token.ok) {
        if (token.status === 401 || token.status === 400) await hooks.onConfigError?.("Credenciais rejeitadas pela E2Payments (autenticação)");
        return { kind: "not_created", reason: `autenticação: ${token.reason}`, userMessage: "Não foi possível iniciar o pagamento. Nada foi cobrado. Tente novamente ou escolha outro método." };
      }

      let res: Response;
      try {
        res = await fetch(`${E2PAYMENTS_BASE_URL}/v1/c2b/${METHODS[m].path}/${encodeURIComponent(wallet)}`, {
          method: "POST",
          headers: {
            Authorization: token.authorization,
            "Content-Type": "application/json",
            Accept: "application/json",
            ...(hooks.origin ? { Origin: hooks.origin } : {}),
          },
          body: JSON.stringify({ client_id: creds.clientId, amount: e2Amount(req.amountCents), phone: req.phone, reference: e2Reference(req.orderCode) }),
          signal: AbortSignal.timeout(E2PAYMENTS_CHARGE_TIMEOUT_MS),
          cache: "no-store",
        });
      } catch (e) {
        // Sem resposta: o comprador pode ter confirmado. Nunca se assume pago nem falhado.
        return { kind: "error", reason: e instanceof Error && e.name === "TimeoutError" ? "sem resposta da E2Payments (tempo excedido)" : "falha de rede ao contactar a E2Payments", retryable: false };
      }
      const json = await readJson(res);
      const msg = apiMessage(json);
      if (res.status === 200 || res.status === 201) {
        return { kind: "paid", externalId: req.reference, amountCents: req.amountCents, currency: "MZN", feeCents: null, rawStatus: `http_${res.status}` };
      }
      if (res.status === 400) return { kind: "failed", externalId: req.reference, reason: msg ?? "pagamento não concluído na carteira", rawStatus: "http_400" };
      if (res.status === 401 || res.status === 403) {
        await hooks.onConfigError?.(res.status === 401 ? "Credenciais rejeitadas pela E2Payments (401)" : "Carteira inexistente ou sem acesso (403)");
        return { kind: "not_created", reason: `HTTP ${res.status}${msg ? `: ${msg}` : ""}`, userMessage: "Não foi possível iniciar o pagamento. Nada foi cobrado. Tente novamente ou escolha outro método." };
      }
      if (res.status >= 500) return { kind: "error", reason: `E2Payments HTTP ${res.status}`, retryable: false };
      return { kind: "not_created", reason: `HTTP ${res.status}${msg ? `: ${msg}` : ""}`, userMessage: "Não foi possível iniciar o pagamento. Nada foi cobrado. Verifique o número e tente novamente." };
    },

    // Sem notificações documentadas: qualquer pedido ao webhook é rejeitado.
    verifySignature: () => false,
    parseEvent() {
      throw new Error("A E2Payments não envia notificações documentadas");
    },
    webhookAck: () => ({ status: 404, body: { error: "not supported" } }),
  };
}
