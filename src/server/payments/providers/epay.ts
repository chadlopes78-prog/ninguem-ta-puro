// Integração EPay (Moçambique, MZN) — implementada conforme a documentação oficial
// (https://painel.epay.co.mz/docs/api; cópia de referência em docs/epay-api.md).
//
// Fluxo: POST /payments → o comprador paga na página alojada (payment_url) com M-Pesa, e-Mola ou IZI →
// a EPay envia um aviso assinado (X-EducavelPay-Signature) para o callback_url → a plataforma confirma.
// A consulta GET /payments/{id} é usada quando o comprador regressa e para reconciliação.
//
// Segredos: EPAY_SECRET_KEY só é lida no servidor (nunca NEXT_PUBLIC_*), nunca é registada em logs nem guardada na BD.
import "server-only";
import { centsToDecimalString, decimalStringToCents } from "@/lib/money";
import { verifyHmacSha256 } from "../webhooks";
import type { ChargeRequest, ChargeResult, ConfigCheck, NormalizedPaymentEvent, NormalizedState, NormalizedStatus, PaymentMethodOption, PaymentProvider } from "../types";

/** URL base documentado. */
export const EPAY_API_BASE_URL = "https://checkout.epay.co.mz/api/v1";
/** Só se aceita redirecionar o comprador para páginas de pagamento neste domínio. */
const PAYMENT_URL_PREFIX = "https://checkout.epay.co.mz/";
const TIMEOUT_MS = 15_000;
const KEY_RE = /^sk_(test|live)_[A-Za-z0-9_-]{6,}$/;
/** Cabeçalho do aviso por pagamento (minúsculas: o objeto Headers é insensível a maiúsculas). */
export const EPAY_SIGNATURE_HEADER = "x-educavelpay-signature";

const STATUS_MAP: Record<string, NormalizedState> = {
  pending: "pending",
  paid: "paid",
  failed: "failed",
  cancelled: "canceled",
};

function secretKey(): string | null {
  const k = process.env.EPAY_SECRET_KEY?.trim();
  return k ? k : null;
}

function appBaseUrl(): string | null {
  return (process.env.APP_BASE_URL ?? process.env.APP_URL)?.trim() || null;
}

function keyEnvironment(): "test" | "live" | null {
  const k = secretKey();
  const m = k ? KEY_RE.exec(k) : null;
  return m ? (m[1] as "test" | "live") : null;
}

const isHttps = (u: string | null) => Boolean(u && /^https:\/\//i.test(u));

export class EPayHttpError extends Error {
  constructor(
    public status: number,
    public apiMessage: string,
    public requestId: string | null,
  ) {
    super(`EPay HTTP ${status}${requestId ? ` (X-Request-Id ${requestId})` : ""}: ${apiMessage}`);
  }
}

interface EPayPayment {
  id: string;
  status: string;
  amount: string;
  fee: string | null;
  net_amount?: string | null;
  currency: string;
  external_reference?: string;
  payment_type?: string | null;
  payment_url?: string;
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const key = secretKey();
  if (!key) throw new Error("EPAY_SECRET_KEY não definida");
  const res = await fetch(`${EPAY_API_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const requestId = res.headers.get("x-request-id");
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const msg = json && typeof json === "object" && "message" in json && typeof (json as { message: unknown }).message === "string" ? (json as { message: string }).message : "erro sem mensagem";
    throw new EPayHttpError(res.status, msg.slice(0, 200), requestId);
  }
  return json as T;
}

function toStatus(p: EPayPayment): NormalizedStatus {
  const state = STATUS_MAP[p.status];
  if (!state) throw new Error(`Estado EPay desconhecido: ${String(p.status).slice(0, 20)}`);
  return {
    externalId: p.id,
    reference: p.external_reference ?? null,
    state,
    amountCents: decimalStringToCents(p.amount),
    currency: p.currency === "MZN" ? "MZN" : null,
    feeCents: p.fee === null || p.fee === undefined ? null : decimalStringToCents(p.fee),
    rawStatus: `${p.status}${p.payment_type ? `:${p.payment_type}` : ""}`,
  };
}

/** Mensagens seguras para o comprador (sem detalhes internos). */
function userMessageFor(status: number): string {
  if (status === 429 || status === 503) return "O serviço de pagamentos está temporariamente ocupado. Nada foi cobrado. Tente novamente dentro de instantes.";
  return "Não foi possível iniciar o pagamento. Nada foi cobrado. Tente novamente ou contacte o suporte.";
}

export const epayProvider: PaymentProvider = {
  id: "epay",
  displayName: "EPay",
  supportedCurrencies: ["MZN"],
  checkoutMode: "hosted",
  hostedMethodsLabel: "M-Pesa, e-Mola ou IZI",

  environment: keyEnvironment,

  isConfigured() {
    const env = keyEnvironment();
    if (!env || !appBaseUrl()) return false;
    // Em produção (chave live) o aviso de pagamento exige um callback_url https público.
    if (env === "live" && !isHttps(appBaseUrl())) return false;
    return true;
  },

  configChecks(): ConfigCheck[] {
    const key = secretKey();
    const env = keyEnvironment();
    const base = appBaseUrl();
    return [
      {
        label: "EPAY_SECRET_KEY",
        ok: Boolean(env),
        detail: !key
          ? "Não definida"
          : !env
            ? "Definida, mas com formato inesperado (deve começar por sk_test_ ou sk_live_)"
            : env === "test"
              ? "Definida — chave de TESTE (sandbox, sem dinheiro real). Valor nunca apresentado."
              : "Definida — chave de PRODUÇÃO (dinheiro real). Valor nunca apresentado.",
      },
      {
        label: "APP_BASE_URL",
        ok: isHttps(base),
        detail: !base
          ? "Não definida"
          : isHttps(base)
            ? `Definida (HTTPS). Avisos de pagamento em ${base.replace(/\/$/, "")}/api/webhooks/epay`
            : "Definida sem HTTPS: os avisos (callback) não são enviados; só funciona a consulta de estado (aceitável apenas com chave de teste)",
      },
      { label: "URL base da API", ok: true, detail: `${EPAY_API_BASE_URL} (documentação oficial)` },
    ];
  },

  methods(): PaymentMethodOption[] {
    // O comprador escolhe o método (M-Pesa, e-Mola, IZI) na página de pagamento da EPay.
    return [];
  },

  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    if (req.currency !== "MZN") return { kind: "not_created", reason: "Moeda não suportada", userMessage: "Este produto só pode ser pago em MZN." };
    const base = appBaseUrl();
    const body: Record<string, unknown> = {
      // Documentação: "amount" é um número em meticais (mín. 1, máx. 10 000 000)
      amount: Number(centsToDecimalString(req.amountCents)),
      currency: "MZN",
      description: req.description.slice(0, 255),
      external_reference: req.reference.slice(0, 255),
      customer_name: req.customer.name.slice(0, 255),
      customer_email: req.customer.email.slice(0, 255),
      return_url: req.returnUrl,
      cancel_url: req.cancelUrl,
    };
    // callback_url "tem de ser um endereço público https"
    if (isHttps(base) && isHttps(req.callbackUrl)) body.callback_url = req.callbackUrl;
    if (req.imageUrl && isHttps(req.imageUrl)) body.image_url = req.imageUrl;

    let p: EPayPayment;
    try {
      p = await request<EPayPayment>("POST", "/payments", body);
    } catch (e) {
      if (e instanceof EPayHttpError) return { kind: "not_created", reason: e.message, userMessage: userMessageFor(e.status) };
      return { kind: "not_created", reason: `Falha de comunicação com a EPay: ${e instanceof Error ? e.name : "erro"}`, userMessage: userMessageFor(0) };
    }
    if (!p?.id || typeof p.payment_url !== "string" || !p.payment_url.startsWith(PAYMENT_URL_PREFIX)) {
      return { kind: "not_created", reason: "Resposta da EPay sem id ou payment_url válido", userMessage: userMessageFor(0) };
    }
    if (decimalStringToCents(p.amount) !== req.amountCents || p.currency !== "MZN") {
      // Nunca enviar o comprador para pagar um valor diferente do da encomenda
      await epayProvider.cancel?.(p.id, "Valor divergente da encomenda").catch(() => undefined);
      return { kind: "not_created", reason: "Valor ou moeda devolvidos pela EPay não correspondem à encomenda", userMessage: userMessageFor(0) };
    }
    return { kind: "redirect", url: p.payment_url, externalId: p.id };
  },

  async cancel(externalId: string, reason: string) {
    try {
      await request("POST", `/payments/${encodeURIComponent(externalId)}/cancel`, { reason: reason.slice(0, 255) });
      return { ok: true as const };
    } catch (e) {
      if (e instanceof EPayHttpError) return { ok: false as const, alreadyPaid: e.status === 422, reason: e.message };
      return { ok: false as const, alreadyPaid: false, reason: "Falha de comunicação com a EPay" };
    }
  },

  async getStatus(externalId: string | null): Promise<NormalizedStatus> {
    if (!externalId) throw new Error("Pagamento sem identificador EPay: não é possível consultar");
    const p = await request<EPayPayment>("GET", `/payments/${encodeURIComponent(externalId)}`);
    return toStatus(p);
  },

  verifySignature(rawBody: string, headers: Headers): boolean {
    // "X-EducavelPay-Signature é o HMAC-SHA256, em hexadecimal, do corpo em bruto, calculado com a tua chave secreta (sk_…)"
    return verifyHmacSha256(rawBody, headers.get(EPAY_SIGNATURE_HEADER)?.trim().toLowerCase() ?? null, secretKey() ?? undefined);
  },

  parseEvent(rawBody: string): NormalizedPaymentEvent {
    const j = JSON.parse(rawBody) as EPayPayment;
    if (!j || typeof j.id !== "string" || typeof j.status !== "string") throw new Error("aviso EPay inválido");
    const status = toStatus(j);
    // O mesmo aviso pode chegar várias vezes: o id do pagamento + estado identifica o aviso
    return { ...status, eventId: `${j.id}:${j.status}` };
  },

  webhookAck() {
    // "Responde com um código 2xx logo que recebas o aviso"
    return { status: 200, body: { received: true } };
  },
};
