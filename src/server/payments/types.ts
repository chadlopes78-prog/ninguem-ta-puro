// Abstração de processadores de pagamento.
// Cada fornecedor traduz a sua API para estes tipos normalizados; o resto da plataforma
// (checkout, confirmação, entrega, relatórios) nunca depende de detalhes de um fornecedor.
import type { CurrencyCode } from "@/lib/money";

export interface PaymentMethodOption {
  id: string;
  label: string;
  /** Métodos de carteira móvel exigem o número de telefone do comprador */
  requiresPhone: boolean;
}

export interface ChargeRequest {
  /** Referência interna única desta tentativa (também usada como chave de idempotência) */
  reference: string;
  orderCode: string;
  amountCents: number;
  currency: CurrencyCode;
  method: string;
  /** Telefone normalizado (ex.: 841234567) quando o método o exige */
  phone: string | null;
  customer: { name: string; email: string };
  /** Página de estado para onde o comprador regressa (nunca é prova de pagamento) */
  returnUrl: string;
  /** Endpoint de notificações do servidor */
  callbackUrl: string;
  description: string;
}

export type ChargeResult =
  /** O comprador deve continuar numa página alojada pelo fornecedor */
  | { kind: "redirect"; url: string; externalId: string }
  /** Pedido aceite; confirmação chega mais tarde (ex.: aprovação no telemóvel) */
  | { kind: "pending"; externalId: string; message?: string }
  /** O fornecedor confirmou o pagamento na resposta autenticada servidor-a-servidor */
  | { kind: "paid"; externalId: string; amountCents: number; currency: CurrencyCode; feeCents: number | null; rawStatus: string }
  /** Rejeição definitiva (ex.: saldo insuficiente, número inválido) */
  | { kind: "failed"; externalId: string | null; reason: string; rawStatus?: string }
  /** Erro de rede/servidor: o estado é incerto e deve ser consultado mais tarde */
  | { kind: "error"; reason: string; retryable: boolean };

export type NormalizedState = "paid" | "pending" | "failed" | "canceled" | "expired";

/** Estado de uma transação confirmado pelo fornecedor (consulta oficial ou notificação autenticada). */
export interface NormalizedStatus {
  externalId: string | null;
  /** A nossa referência (ChargeRequest.reference), quando o fornecedor a devolve */
  reference: string | null;
  state: NormalizedState;
  amountCents: number | null;
  currency: CurrencyCode | null;
  feeCents: number | null;
  rawStatus: string;
}

export interface NormalizedPaymentEvent extends NormalizedStatus {
  /** Identificador único do evento/notificação (idempotência) */
  eventId: string;
}

export interface ConfigCheck {
  label: string;
  ok: boolean;
  detail: string;
}

export interface PaymentProvider {
  id: string;
  displayName: string;
  supportedCurrencies: readonly CurrencyCode[];
  /** Verdadeiro apenas quando credenciais existem E a integração está completa e validada. */
  isConfigured(): boolean;
  /** Verificação administrativa: indica o que está configurado sem nunca revelar segredos. */
  configChecks(): ConfigCheck[];
  methods(): PaymentMethodOption[];
  createCharge(req: ChargeRequest): Promise<ChargeResult>;
  /** Consulta oficial do estado da transação. */
  getStatus(externalId: string | null, reference: string): Promise<NormalizedStatus>;
  /** Verifica a autenticidade da notificação exatamente como documentado pelo fornecedor. */
  verifySignature(rawBody: string, headers: Headers): boolean;
  parseEvent(rawBody: string, headers: Headers): NormalizedPaymentEvent;
  /** Resposta HTTP que o fornecedor espera receber após uma notificação aceite. */
  webhookAck(): { status: number; body: unknown };
}

/** Catálogo informativo de fornecedores (sem APIs nem credenciais inventadas). */
export const PROVIDER_CATALOG = [
  { id: "epay", name: "EPay (Moçambique)", regions: "Moçambique · MZN", methods: "Carteiras móveis (a confirmar na documentação e no painel)" },
] as const;
