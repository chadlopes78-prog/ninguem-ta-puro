// Fornecedor Pagar API (M-Pesa e eMola), implementado EXCLUSIVAMENTE a partir do guia oficial
// (docs/pagar-api.md — https://pagar.co.mz/docs/ai-integration.md). Só o backend fala com a Pagar.
//
// Endpoints usados (todos documentados no guia):
//   POST /payments                          — pagamento C2B (assinado com HMAC + Idempotency-Key)
//   GET  /payments/:id                      — consulta autenticada
//   GET  /payments/by-reference/:reference  — recuperação quando a resposta inicial se perdeu
//   GET  /wallet                            — só para verificar se as credenciais são aceites
// Webhooks: cabeçalhos Pagar-Event-Id e Pagar-Signature (t=…,v1=…), HMAC-SHA256 de `${t}.${rawBody}`, ±300 s.
//
// Regras do guia aplicadas:
//   - título e valor vêm dos registos internos (oferta/produto na BD), nunca do browser;
//   - valores inteiros em MZN, entre 20 e 40 000;
//   - a resposta 202 inicial NUNCA liberta o produto: a entrega só acontece com PAID confirmado por webhook validado
//     ou por consulta autenticada (por isso um "PAID" na resposta inicial é tratado como pendente e consultado);
//   - repetições de rede usam a mesma Idempotency-Key e o mesmo body (só timestamp e nonce mudam);
//   - nada de top-ups nem payouts (a plataforma não movimenta saldos nem tem levantamentos).
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import type { ChargeRequest, ChargeResult, ConfigCheck, NormalizedPaymentEvent, NormalizedStatus, PaymentMethodOption, PaymentProvider } from "../types";

export const PAGAR_DEFAULT_BASE_URL = "https://api.pagar.co.mz/api/v1";
export const PAGAR_MIN_MZN = 20;
export const PAGAR_MAX_MZN = 40_000;
/** Tolerância do relógio na validação dos webhooks (guia: 300 s) */
export const PAGAR_WEBHOOK_TOLERANCE_S = 300;

export interface PagarCredentials {
  apiKey: string;
  signingSecret: string;
  webhookSecret: string;
  baseUrl: string;
  source: "env" | "panel";
}

const SECRET_RE = /^[A-Za-z0-9_\-.]{8,300}$/;

/** Ambiente pelo prefixo documentado da API key (sk_test_… / sk_live_…). */
export function pagarKeyEnvironment(apiKey: string | null | undefined): "test" | "live" | null {
  if (!apiKey) return null;
  if (apiKey.startsWith("sk_test_")) return "test";
  if (apiKey.startsWith("sk_live_")) return "live";
  return null;
}

/** Endereço base da API: o do guia por omissão; outro só por variável de ambiente e sempre HTTPS. */
export function pagarBaseUrl(): string {
  const v = process.env.PAGAR_API_BASE_URL?.trim();
  return v && /^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(v) ? v.replace(/\/+$/, "") : PAGAR_DEFAULT_BASE_URL;
}

/** Credenciais nas variáveis de ambiente (só para a conta proprietária — ver gateways.ts). */
export type PagarMode = "test" | "live";

function envSet(prefix: string): PagarCredentials | null {
  const apiKey = process.env[`${prefix}API_KEY`]?.trim() ?? "";
  const signingSecret = process.env[`${prefix}SIGNING_SECRET`]?.trim() ?? "";
  const webhookSecret = process.env[`${prefix}WEBHOOK_SECRET`]?.trim() ?? "";
  if (!apiKey || !signingSecret || !webhookSecret) return null;
  return { apiKey, signingSecret, webhookSecret, baseUrl: pagarBaseUrl(), source: "env" };
}

/** Primeiro conjunto das variáveis do servidor (PAGAR_* e, opcionalmente, PAGAR_LIVE_* para produção). */
export function pagarEnvCredentials(): PagarCredentials | null {
  return envSet("PAGAR_") ?? envSet("PAGAR_LIVE_");
}

/** Conjuntos das variáveis do servidor por ambiente (pelo prefixo da API key: sk_test_ / sk_live_). */
export function pagarEnvCredentialSets(): Partial<Record<PagarMode, PagarCredentials>> {
  const out: Partial<Record<PagarMode, PagarCredentials>> = {};
  for (const set of [envSet("PAGAR_"), envSet("PAGAR_LIVE_")]) {
    const env = set && pagarKeyEnvironment(set.apiKey);
    if (set && env && !out[env]) out[env] = set;
  }
  return out;
}

export function validPagarSecret(v: string | null | undefined): v is string {
  return typeof v === "string" && SECRET_RE.test(v);
}

// ───────────── Cliente (guia, secção 04) ─────────────

export class PagarApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly requestId: string | null,
    message: string,
  ) {
    super(message);
  }
}

/** Erro de rede/servidor (sem resposta JSON utilizável): o resultado é incerto. */
export class PagarNetworkError extends Error {}

async function readResponse(response: Response): Promise<Record<string, unknown>> {
  let data: Record<string, unknown> | null = null;
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    if (response.ok || response.status >= 500) throw new PagarNetworkError(`Resposta sem JSON (HTTP ${response.status})`);
  }
  if (!response.ok) {
    const str = (k: string) => (data && typeof data[k] === "string" ? (data[k] as string) : null);
    if (response.status >= 500) throw new PagarNetworkError(`HTTP ${response.status}${str("requestId") ? ` (requestId ${str("requestId")})` : ""}`);
    throw new PagarApiError(response.status, str("error"), str("requestId"), str("message") ?? "Pedido rejeitado pela Pagar API");
  }
  return data ?? {};
}

export function pagarClient(creds: Pick<PagarCredentials, "apiKey" | "signingSecret" | "baseUrl">, fetchImpl: typeof fetch = (...a) => fetch(...a)) {
  return {
    async get(path: string): Promise<Record<string, unknown>> {
      let response: Response;
      try {
        response = await fetchImpl(creds.baseUrl + path, { headers: { Authorization: "Bearer " + creds.apiKey }, cache: "no-store" });
      } catch (e) {
        throw new PagarNetworkError(e instanceof Error ? e.message : "erro de rede");
      }
      return readResponse(response);
    },
    /** POST assinado. Repetir a mesma operação = mesma idempotencyKey e mesmo body (timestamp e nonce novos). */
    async post(path: string, body: unknown, idempotencyKey: string): Promise<Record<string, unknown>> {
      const timestamp = Date.now().toString();
      const nonce = randomBytes(18).toString("base64url");
      const rawBody = JSON.stringify(body);
      const bodyHash = createHash("sha256").update(rawBody).digest("hex");
      const url = creds.baseUrl + path;
      const canonicalPath = new URL(url).pathname;
      const canonical = [timestamp, nonce, "POST", canonicalPath, bodyHash].join("\n");
      const signature = createHmac("sha256", creds.signingSecret).update(canonical).digest("hex");
      let response: Response;
      try {
        response = await fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + creds.apiKey,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
            "X-Pagar-Timestamp": timestamp,
            "X-Pagar-Nonce": nonce,
            "X-Pagar-Signature": "v1=" + signature,
          },
          body: rawBody,
          cache: "no-store",
        });
      } catch (e) {
        throw new PagarNetworkError(e instanceof Error ? e.message : "erro de rede");
      }
      return readResponse(response);
    },
  };
}

// ───────────── Webhooks (guia, secção 06) ─────────────

/** Valida um webhook exatamente como no guia: Pagar-Event-Id presente, t numérico, v1 hex, ±300 s, HMAC em tempo constante. */
export function verifyPagarWebhook(rawBody: string, headers: Headers, webhookSecret: string, nowMs = Date.now()): { ok: true; eventId: string } | { ok: false; status: 400 | 401 } {
  const eventId = headers.get("pagar-event-id");
  if (!eventId) return { ok: false, status: 400 };
  const parts = Object.fromEntries((headers.get("pagar-signature") ?? "").split(",").map((p) => {
    const i = p.indexOf("=");
    return i < 0 ? [p.trim(), ""] : [p.slice(0, i).trim(), p.slice(i + 1).trim()];
  }));
  const timestamp = parts.t ?? "";
  const received = parts.v1 ?? "";
  if (!/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/.test(received)) return { ok: false, status: 401 };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > PAGAR_WEBHOOK_TOLERANCE_S) return { ok: false, status: 401 };
  const expected = createHmac("sha256", webhookSecret).update(timestamp + "." + rawBody).digest();
  const given = Buffer.from(received, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, status: 401 };
  return { ok: true, eventId: eventId.slice(0, 200) };
}

/**
 * Identificadores do pagamento num webhook JÁ validado. O guia não descreve o formato do corpo do evento, por isso
 * não se confia no estado que ele traga: procura-se apenas o objeto de pagamento (id "pay_…" e/ou reference) para
 * depois CONSULTAR a Pagar com a API key (fonte de verdade). Eventos sem pagamento (carteira, payout, teste) → null.
 */
export function pagarEventPaymentRef(event: unknown): { id: string | null; reference: string | null } | null {
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number): { id: string | null; reference: string | null } | null => {
    if (!v || typeof v !== "object" || depth > 3 || seen.has(v)) return null;
    seen.add(v);
    const o = v as Record<string, unknown>;
    const id = typeof o.id === "string" && /^pay_[A-Za-z0-9_-]{1,120}$/.test(o.id) ? o.id : null;
    if (id) return { id, reference: typeof o.reference === "string" ? o.reference.slice(0, 120) : null };
    for (const k of ["payment", "data", "object"]) {
      const r = visit(o[k], depth + 1);
      if (r) return r;
    }
    return null;
  };
  return visit(event, 0);
}

// ───────────── Estados (guia, secção 06) ─────────────

interface PagarPayment {
  id: string;
  status: string;
  amountMzn: number | null;
  currency: string | null;
  reference: string | null;
  safeMessage: string | null;
  failureReason: string | null;
}

function readPayment(data: Record<string, unknown>): PagarPayment | null {
  const p = (data.payment && typeof data.payment === "object" ? data.payment : data) as Record<string, unknown>;
  if (typeof p.id !== "string" || typeof p.status !== "string") return null;
  const s = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : null);
  return {
    id: p.id,
    status: p.status.toUpperCase(),
    amountMzn: typeof p.amountMzn === "number" && Number.isSafeInteger(p.amountMzn) ? p.amountMzn : null,
    currency: s("currency"),
    reference: s("reference"),
    safeMessage: s("safeMessage"),
    failureReason: s("failureReason"),
  };
}

export function normalizePagarStatus(p: PagarPayment): NormalizedStatus {
  // Só PAID confirma; RECONCILIATION_REQUIRED/PENDING/PROCESSING ficam pendentes (nunca entregues nem repetidos)
  const state = p.status === "PAID" ? "paid" : p.status === "FAILED" ? "failed" : p.status === "CANCELLED" ? "canceled" : "pending";
  return {
    externalId: p.id,
    reference: p.reference,
    state,
    amountCents: p.amountMzn !== null ? p.amountMzn * 100 : null,
    currency: p.currency === "MZN" ? "MZN" : null,
    feeCents: null,
    rawStatus: p.status.slice(0, 40),
    // motivo devolvido pela Pagar (failureReason) e mensagem segura (safeMessage), para classificar o resultado
    failureMessage: state === "failed" || state === "canceled" ? [p.failureReason, p.safeMessage].filter(Boolean).join(" — ") || null : null,
  };
}

const METHODS: PaymentMethodOption[] = [
  { id: "mpesa", label: "M-Pesa", requiresPhone: true, phonePrefixes: ["84", "85"] },
  { id: "emola", label: "e-Mola", requiresPhone: true, phonePrefixes: ["86", "87"] },
];
const METHOD_CODE: Record<string, "MPESA" | "EMOLA"> = { mpesa: "MPESA", emola: "EMOLA" };

/** Repetições automáticas por falha de rede/5xx (mesma key e mesmo body, como o guia indica). */
const RETRY_DELAYS_MS = [400, 1200];

export function createPagarProvider(
  creds: PagarCredentials | null,
  opts: { onConfigError?: (reason: string) => Promise<void> | void; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {},
): PaymentProvider & { verifyCredentials(): Promise<{ ok: boolean; message: string }>; webhookSecret: string | null } {
  const environment = () => pagarKeyEnvironment(creds?.apiKey);
  const configured = () => Boolean(creds && validPagarSecret(creds.apiKey) && environment() && validPagarSecret(creds.signingSecret) && validPagarSecret(creds.webhookSecret));
  const client = () => pagarClient(creds!, opts.fetchImpl);
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  return {
    id: "pagar",
    displayName: "Pagar",
    supportedCurrencies: ["MZN"],
    checkoutMode: "direct",
    acceptsWebhooks: true,
    webhookSecret: creds?.webhookSecret ?? null,
    environment: () => (configured() ? environment() : null),
    isConfigured: configured,
    configChecks(): ConfigCheck[] {
      return [
        { label: "API key", ok: Boolean(creds && validPagarSecret(creds.apiKey) && environment()), detail: creds?.apiKey ? (environment() === "live" ? "Produção (sk_live_)" : environment() === "test" ? "Teste (sk_test_)" : "Formato inválido (sk_test_… ou sk_live_…)") : "Em falta" },
        { label: "Signing secret", ok: validPagarSecret(creds?.signingSecret), detail: creds?.signingSecret ? "Guardado (nunca mostrado)" : "Em falta" },
        { label: "Webhook secret", ok: validPagarSecret(creds?.webhookSecret), detail: creds?.webhookSecret ? "Guardado (nunca mostrado)" : "Em falta" },
        { label: "Endereço da API", ok: Boolean(creds?.baseUrl.startsWith("https://")), detail: creds?.baseUrl ?? pagarBaseUrl() },
      ];
    },
    methods: () => METHODS,

    async createCharge(req: ChargeRequest): Promise<ChargeResult> {
      if (!configured()) return { kind: "not_created", reason: "Credenciais da Pagar em falta", userMessage: "O pagamento não está disponível de momento. Nenhum valor foi cobrado." };
      // valores inteiros em MZN, 20–40 000 (guia, secção 05) — o valor vem da oferta guardada na BD
      if (req.currency !== "MZN" || req.amountCents % 100 !== 0) {
        return { kind: "not_created", reason: "Valor não inteiro em MZN", userMessage: "Este valor não pode ser pago com M-Pesa/e-Mola por este método. Nenhum valor foi cobrado." };
      }
      const amountMzn = req.amountCents / 100;
      if (amountMzn < PAGAR_MIN_MZN || amountMzn > PAGAR_MAX_MZN) {
        return { kind: "not_created", reason: `Valor fora dos limites (${amountMzn} MZN)`, userMessage: `Este método aceita pagamentos entre ${PAGAR_MIN_MZN} e ${PAGAR_MAX_MZN.toLocaleString("pt-PT")} MZN. Nenhum valor foi cobrado.` };
      }
      const method = req.method ? METHOD_CODE[req.method] : undefined;
      if (!method || !req.phone) return { kind: "not_created", reason: "Método ou telefone em falta", userMessage: "Escolha M-Pesa ou e-Mola e indique o número. Nenhum valor foi cobrado." };

      // título e descrição derivados dos registos internos (produto/oferta e código da encomenda)
      const body = {
        reference: req.reference,
        title: req.description.slice(0, 120),
        description: `Pedido ${req.orderCode}`,
        amountMzn,
        method,
        payerPhone: req.phone,
      };
      const idempotencyKey = `payment:${req.reference}`;
      let ambiguous = false;
      for (let attempt = 0; ; attempt++) {
        try {
          const payment = readPayment(await client().post("/payments", body, idempotencyKey));
          if (!payment) return { kind: "error", reason: "Resposta da Pagar sem pagamento", retryable: true };
          if (payment.status === "FAILED" || payment.status === "CANCELLED") {
            return { kind: "failed", externalId: payment.id, reason: [payment.failureReason, payment.safeMessage].filter(Boolean).join(" — "), rawStatus: payment.status };
          }
          // PENDING/PROCESSING/RECONCILIATION_REQUIRED — e também PAID: a resposta inicial nunca liberta o produto;
          // a confirmação chega por webhook validado ou consulta autenticada.
          return { kind: "pending", externalId: payment.id, message: "Confirme o pagamento no seu telemóvel." };
        } catch (e) {
          if (e instanceof PagarNetworkError) {
            ambiguous = true;
            console.warn(`[pagar] POST /payments sem resposta conclusiva (tentativa ${attempt + 1}): ${e.message.slice(0, 160)}`);
            if (attempt < RETRY_DELAYS_MS.length) {
              await sleep(RETRY_DELAYS_MS[attempt]);
              continue;
            }
            return { kind: "error", reason: `Pagar sem resposta conclusiva: ${e.message}`.slice(0, 180), retryable: true };
          }
          if (e instanceof PagarApiError) {
            const tag = `${e.code ?? "erro"}${e.requestId ? ` (requestId ${e.requestId})` : ""}`;
            // diagnóstico nos registos do servidor: código, requestId e mensagem da Pagar (sem chaves nem telefones)
            console.warn(`[pagar] POST /payments recusado: HTTP ${e.status} ${tag} — ${e.message.slice(0, 160)}`);
            // 409 = conflito de reference/idempotência/estado: consultar antes de decidir (estado incerto)
            if (e.status === 409 || ambiguous) return { kind: "error", reason: `Pagar ${e.status} ${tag}`.slice(0, 180), retryable: true };
            if (e.status === 401 || e.status === 403) {
              await opts.onConfigError?.(`Pagar recusou as credenciais (${e.status} ${tag}). Verifique a API key, o signing secret e o ambiente da app.`);
              return { kind: "not_created", reason: `Pagar ${e.status} ${tag}`, userMessage: "O pagamento não está disponível de momento. Nenhum valor foi cobrado." };
            }
            if (e.status === 429) return { kind: "not_created", reason: `Pagar 429 ${tag}`, userMessage: "Muitos pedidos neste momento. Aguarde um pouco e tente novamente. Nenhum valor foi cobrado." };
            // 400 e restantes 4xx: dados recusados, nada foi criado. A mensagem da Pagar explica o motivo ao comprador.
            const why = e.message && e.message !== "Pedido rejeitado pela Pagar API" ? ` (${e.message.slice(0, 140)})` : "";
            return { kind: "not_created", reason: `Pagar ${e.status} ${tag}: ${e.message}`.slice(0, 180), userMessage: `O pagamento não foi iniciado${why}. Verifique o número e o método escolhidos e tente novamente. Nenhum valor foi cobrado.` };
          }
          throw e;
        }
      }
    },

    /** Consulta autenticada: pelo ID quando existe; senão pela reference (resposta inicial perdida). */
    async getStatus(externalId: string | null, reference: string): Promise<NormalizedStatus> {
      if (!configured()) throw new Error("Pagar não configurada");
      const path = externalId ? `/payments/${encodeURIComponent(externalId)}` : `/payments/by-reference/${encodeURIComponent(reference)}`;
      const payment = readPayment(await client().get(path));
      if (!payment) throw new Error("Resposta da Pagar sem pagamento");
      return normalizePagarStatus(payment);
    },

    /** Verifica se a Pagar aceita a API key (GET /wallet, documentado). Não revela segredos nem saldos. */
    async verifyCredentials() {
      if (!configured()) return { ok: false, message: "Preencha a API key (sk_test_… ou sk_live_…), o signing secret e o webhook secret." };
      try {
        await client().get("/wallet");
        return { ok: true, message: `Ligação verificada (${environment() === "live" ? "produção" : "teste"}).` };
      } catch (e) {
        if (e instanceof PagarApiError) return { ok: false, message: `A Pagar recusou as credenciais (HTTP ${e.status}${e.code ? ` ${e.code}` : ""}).` };
        return { ok: false, message: "Não foi possível contactar a Pagar. Tente novamente dentro de instantes." };
      }
    },

    verifySignature(rawBody: string, headers: Headers): boolean {
      return Boolean(creds?.webhookSecret) && verifyPagarWebhook(rawBody, headers, creds!.webhookSecret).ok;
    },
    /** O estado nunca vem do corpo do webhook: ver handlePagarWebhook (consulta autenticada). */
    parseEvent(_rawBody: string, headers: Headers): NormalizedPaymentEvent {
      return { eventId: headers.get("pagar-event-id") ?? "", externalId: null, reference: null, state: "pending", amountCents: null, currency: null, feeCents: null, rawStatus: "webhook" };
    },
    webhookAck: () => ({ status: 200, body: { received: true } }),
  };
}
