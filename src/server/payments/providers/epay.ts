// Integração EPay (Moçambique, MZN).
//
// IMPORTANTE — documentação oficial (https://painel.epay.co.mz/docs/api) ainda não verificada:
// o domínio esteve inacessível a partir do ambiente onde este código foi escrito. Por regra do projeto,
// nenhum endpoint, campo, estado ou algoritmo de assinatura foi inventado. Todos os pontos que dependem
// da API estão concentrados em EPAY_CONTRACT abaixo e marcados como pendentes. Enquanto
// EPAY_CONTRACT.confirmed for false, isConfigured() devolve false e a plataforma NÃO tenta cobrar.
//
// Segredos: lidos apenas no servidor, de variáveis de ambiente (nunca NEXT_PUBLIC_*), nunca registados em logs.
import "server-only";
import type { ChargeRequest, ChargeResult, ConfigCheck, NormalizedPaymentEvent, NormalizedStatus, PaymentMethodOption, PaymentProvider } from "../types";

/** Pontos da API a confirmar na documentação oficial antes de ativar a integração. */
export const EPAY_CONTRACT = {
  /** Passa a true apenas depois de todos os itens abaixo estarem implementados conforme a documentação. */
  confirmed: false,
  pending: [
    "URL base da API e se existe ambiente de testes (sandbox) separado com credenciais próprias",
    "Formato exato da autenticação (cabeçalho e esquema) com EPAY_SECRET_KEY",
    "Endpoint, método e campos obrigatórios para criar um pagamento (montante: unidades ou cêntimos; código de moeda 'MZN'; referência do comerciante; telefone; método)",
    "Códigos dos métodos de pagamento ativos para a conta (ex.: M-Pesa, e-Mola) e formato do número de telefone",
    "Formato da resposta: identificador da transação, URL de checkout alojado (se existir) e estados possíveis",
    "Endpoint de consulta do estado de uma transação",
    "Lista de estados da transação e respetivo significado (pago, pendente, falhado, cancelado, expirado)",
    "Notificações (callback/webhook): como se configura o URL, campos enviados, identificador único do evento",
    "Assinatura das notificações: cabeçalho, algoritmo, segredo usado e se é calculada sobre o corpo bruto",
    "Código HTTP e corpo de resposta esperados pela EPay ao receber uma notificação; política de reenvio",
    "Taxas devolvidas pela API (se existirem) e códigos de erro documentados",
  ],
} as const;

export class EPayContractPendingError extends Error {
  constructor(what: string) {
    super(`Integração EPay incompleta: ${what} ainda não confirmado na documentação oficial.`);
  }
}

function env() {
  return {
    secretKey: process.env.EPAY_SECRET_KEY?.trim() || null,
    apiBaseUrl: process.env.EPAY_API_BASE_URL?.trim() || null,
    appBaseUrl: (process.env.APP_BASE_URL ?? process.env.APP_URL)?.trim() || null,
  };
}

export const epayProvider: PaymentProvider = {
  id: "epay",
  displayName: "EPay",
  supportedCurrencies: ["MZN"],

  isConfigured() {
    const e = env();
    return Boolean(EPAY_CONTRACT.confirmed && e.secretKey && e.apiBaseUrl && e.appBaseUrl);
  },

  configChecks(): ConfigCheck[] {
    const e = env();
    const httpsApp = Boolean(e.appBaseUrl && /^https:\/\//.test(e.appBaseUrl));
    return [
      { label: "EPAY_SECRET_KEY", ok: Boolean(e.secretKey), detail: e.secretKey ? "Definida no servidor (valor nunca apresentado)" : "Não definida" },
      { label: "EPAY_API_BASE_URL", ok: Boolean(e.apiBaseUrl), detail: e.apiBaseUrl ? "Definida" : "Não definida — confirmar valor na documentação oficial" },
      { label: "APP_BASE_URL", ok: httpsApp, detail: e.appBaseUrl ? (httpsApp ? "Definida (HTTPS)" : "Definida, mas sem HTTPS — necessário para notificações em produção") : "Não definida" },
      { label: "Contrato da API verificado", ok: EPAY_CONTRACT.confirmed, detail: EPAY_CONTRACT.confirmed ? "Implementado conforme a documentação" : `${EPAY_CONTRACT.pending.length} pontos por confirmar na documentação oficial` },
    ];
  },

  methods(): PaymentMethodOption[] {
    // Os códigos dos métodos dependem da documentação e da conta do comerciante.
    if (!EPAY_CONTRACT.confirmed) return [];
    throw new EPayContractPendingError("lista de métodos de pagamento");
  },

  async createCharge(_req: ChargeRequest): Promise<ChargeResult> {
    throw new EPayContractPendingError("endpoint e campos de criação de pagamento");
  },

  async getStatus(_externalId: string | null, _reference: string): Promise<NormalizedStatus> {
    throw new EPayContractPendingError("consulta de estado da transação");
  },

  verifySignature(_rawBody: string, _headers: Headers): boolean {
    // Sem mecanismo documentado, nenhuma notificação é aceite.
    return false;
  },

  parseEvent(_rawBody: string, _headers: Headers): NormalizedPaymentEvent {
    throw new EPayContractPendingError("formato das notificações");
  },

  webhookAck() {
    return { status: 200, body: { received: true } };
  },
};
