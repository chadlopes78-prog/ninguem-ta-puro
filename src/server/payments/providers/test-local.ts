// Fornecedor de pagamentos FICTÍCIO, usado apenas nos testes automáticos para exercitar o fluxo completo
// (criação, pendente, pago, falhado, cancelado, notificações assinadas, duplicados) sem contactar a EPay.
// Só é registado quando NTP_ENABLE_TEST_PROVIDER=true E a base de dados é a de testes (ntp_test).
// Não representa o comportamento real da EPay.
import { randomBytes } from "crypto";
import type { CurrencyCode } from "@/lib/money";
import { verifyHmacSha256 } from "../webhooks";
import type { ChargeRequest, ChargeResult, NormalizedPaymentEvent, NormalizedStatus, PaymentProvider } from "../types";

export function testProviderAllowed(): boolean {
  return process.env.NTP_ENABLE_TEST_PROVIDER === "true" && Boolean(process.env.DATABASE_URL?.includes("/ntp_test"));
}

// O identificador externo codifica o montante e o comportamento do cenário, para que a "consulta oficial"
// fictícia seja determinística sem estado partilhado.
//   telefone terminado em 0 → recusa imediata
//   telefone terminado em 9 → erro de rede (estado incerto)
//   telefone terminado em 1 → consulta de estado devolve "pago"
//   telefone terminado em 2 → consulta de estado devolve "expirado"
//   restantes             → pendente até chegar uma notificação
function encode(amount: number, scenario: string) {
  return `tl_${amount}_${scenario}_${randomBytes(6).toString("hex")}`;
}
function decode(externalId: string | null) {
  const m = externalId ? /^tl_(\d+)_([a-z]+)_[0-9a-f]+$/.exec(externalId) : null;
  return m ? { amount: Number(m[1]), scenario: m[2] } : null;
}

export const testLocalProvider: PaymentProvider = {
  id: "teste-local",
  displayName: "Fornecedor de teste (local)",
  supportedCurrencies: ["MZN"],
  checkoutMode: "direct",
  environment: () => "test",
  isConfigured: () => testProviderAllowed() && Boolean(process.env.TEST_PROVIDER_SECRET),
  configChecks: () => [{ label: "Fornecedor de teste", ok: testProviderAllowed(), detail: "Apenas na base de dados de testes" }],
  methods: () => [
    { id: "mpesa", label: "M-Pesa (teste)", requiresPhone: true },
    { id: "emola", label: "e-Mola (teste)", requiresPhone: true },
  ],

  async createCharge(req: ChargeRequest): Promise<ChargeResult> {
    const last = req.phone?.slice(-1);
    if (last === "0") return { kind: "failed", externalId: encode(req.amountCents, "declined"), reason: "Pagamento recusado pela carteira (teste)", rawStatus: "declined" };
    if (last === "9") return { kind: "error", reason: "Tempo de resposta excedido (teste)", retryable: true };
    const scenario = last === "1" ? "paidonquery" : last === "2" ? "expiresonquery" : "pending";
    return { kind: "pending", externalId: encode(req.amountCents, scenario), message: "Confirme o pagamento no seu telemóvel." };
  },

  async getStatus(externalId: string | null, reference: string): Promise<NormalizedStatus> {
    const d = decode(externalId);
    const state = d?.scenario === "paidonquery" ? "paid" : d?.scenario === "expiresonquery" ? "expired" : "pending";
    return { externalId, reference, state, amountCents: d ? d.amount : null, currency: "MZN", feeCents: state === "paid" ? 0 : null, rawStatus: state };
  },

  verifySignature: (raw, headers) => verifyHmacSha256(raw, headers.get("x-test-signature"), process.env.TEST_PROVIDER_SECRET),

  parseEvent(raw: string): NormalizedPaymentEvent {
    const j = JSON.parse(raw) as Record<string, unknown>;
    const str = (k: string) => (typeof j[k] === "string" ? (j[k] as string) : null);
    const num = (k: string) => (typeof j[k] === "number" && Number.isSafeInteger(j[k]) ? (j[k] as number) : null);
    const state = str("status");
    if (!str("eventId") || !state || !["paid", "pending", "failed", "canceled", "expired"].includes(state)) throw new Error("payload inválido");
    return {
      eventId: str("eventId")!,
      externalId: str("externalId"),
      reference: str("reference"),
      state: state as NormalizedStatus["state"],
      amountCents: num("amountCents"),
      currency: (str("currency") as CurrencyCode | null) ?? null,
      feeCents: num("feeCents"),
      rawStatus: state,
    };
  },

  webhookAck: () => ({ status: 200, body: { received: true } }),
};
