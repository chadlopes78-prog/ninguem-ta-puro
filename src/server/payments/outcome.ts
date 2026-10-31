// Classificação normalizada do resultado de um pagamento, igual para todos os gateways.
//
// Cada gateway devolve os motivos à sua maneira (texto livre, códigos próprios ou nada). Aqui só se lê o que o
// gateway efetivamente devolveu — nunca se inventa um motivo:
//   - Pagar: `failureReason` / `safeMessage` da consulta autenticada (docs/pagar-api.md, secção 06);
//   - E2Payments: `message` da resposta HTTP 400 do pedido C2B (docs/e2payments-api.md);
//   - EPay: o objeto pagamento só tem `status` (pending/paid/failed/cancelled) e não traz motivo; `cancelled`
//     significa «cancelado pela loja ou reembolsado» (docs/epay-api.md), nunca «pelo cliente».
// Os padrões reconhecem o texto em português e inglês e os códigos de resposta da API M-Pesa (Vodacom
// Moçambique: INS-5 transação cancelada pelo cliente, INS-6 transação falhada, INS-9 tempo de pedido excedido,
// INS-2006 saldo insuficiente), quando o gateway os repassa na mensagem.
// Sem padrão reconhecido, a justificativa é o motivo real devolvido pelo gateway; sem motivo, diz-se que o
// gateway não o indicou.
import type { NormalizedState } from "./types";

export type FailureCode =
  | "CUSTOMER_CANCELLED"
  | "INSUFFICIENT_FUNDS"
  | "WRONG_PIN"
  | "INVALID_NUMBER"
  | "EXPIRED"
  | "TIMEOUT"
  | "DECLINED"
  | "GATEWAY_INTERNAL"
  | "GATEWAY_ERROR"
  | "NOT_STARTED"
  | "UNKNOWN";

export const FAILURE_LABELS: Record<FailureCode, string> = {
  CUSTOMER_CANCELLED: "Cancelado pelo cliente",
  INSUFFICIENT_FUNDS: "Saldo insuficiente na carteira do cliente",
  WRONG_PIN: "PIN incorrecto",
  INVALID_NUMBER: "Número inválido ou sem carteira móvel activa",
  EXPIRED: "Pagamento expirado: não foi confirmado a tempo",
  TIMEOUT: "Tempo de espera excedido",
  DECLINED: "Pagamento recusado pelo operador. Tente novamente.",
  GATEWAY_INTERNAL: "Erro interno do gateway de pagamento",
  GATEWAY_ERROR: "Erro do gateway",
  NOT_STARTED: "Pagamento não iniciado pelo gateway",
  UNKNOWN: "O gateway não indicou o motivo",
};

const PATTERNS: [FailureCode, RegExp][] = [
  // a ordem importa: saldo antes de "falhou", cancelamento antes de "tempo excedido"
  ["INSUFFICIENT_FUNDS", /\bINS-2006\b|saldo\s+insuficiente|fundos\s+insuficientes|sem\s+saldo|insufficient[\s_-]*(balance|funds)|not\s+enough\s+(balance|funds)|NSF\b/i],
  ["WRONG_PIN", /\bpin\b[^.]{0,30}\b(incorrect|incorrecto|incorreto|inv[aá]lido|invalid|errado|wrong)|\b(incorrect|invalid|wrong)\s+pin\b/i],
  [
    "CUSTOMER_CANCELLED",
    /\bINS-5\b|cancel+ad[oa]\s+pelo\s+(cliente|utilizador|usu[aá]rio|comprador|assinante)|rejeitad[oa]\s+pelo\s+(cliente|utilizador|usu[aá]rio|comprador)|recusad[oa]\s+pelo\s+(cliente|utilizador|usu[aá]rio|comprador)|(cancel+ed|rejected|declined)\s+by\s+(the\s+)?(user|customer|subscriber|payer|client)|(user|customer|subscriber|payer)[\s_-]*(cancel+ed|rejected|declined)/i,
  ],
  ["INVALID_NUMBER", /\bINS-(2051|2057)\b|invalid[\s_-]*(msisdn|phone|number|mobile|payer)|(msisdn|phone\s*number|subscriber|wallet|account)\s+(not\s+found|not\s+registered|does\s+not\s+exist|is\s+invalid)|n[uú]mero\s+(inv[aá]lido|n[aã]o\s+registado|incorrecto|incorreto)|sem\s+(conta|carteira)/i],
  ["EXPIRED", /\bexpired\b|expirad[oa]/i],
  ["TIMEOUT", /\bINS-9\b|time[\s_-]?out|timed\s+out|tempo\s+(de\s+(espera|resposta)\s+)?(excedido|esgotado)/i],
  ["GATEWAY_INTERNAL", /internal\s+(server\s+)?error|erro\s+interno|service\s+unavailable|servi[cç]o\s+indispon[ií]vel|\bHTTP\s+5\d\d\b/i],
  // recusa sem causa específica («Payment was declined», «Transaction failed», INS-6): recusada pelo operador
  ["DECLINED", /\bINS-6\b|\b(was\s+)?declined\b|\brejected\b|transaction\s+failed|payment\s+failed|recusad[oa]|rejeitad[oa]|transa[cç][aã]o\s+falhada/i],
];

/** Lê o código normalizado de um motivo devolvido pelo gateway (null quando nenhum padrão corresponde). */
export function matchFailure(message: string | null | undefined): FailureCode | null {
  if (!message) return null;
  for (const [code, re] of PATTERNS) if (re.test(message)) return code;
  return null;
}

export interface Outcome {
  /** Estado final a aplicar (pode passar de "failed" a "canceled" quando o gateway diz que o cliente cancelou e vice-versa) */
  state: NormalizedState;
  code: FailureCode | null;
  /** Justificativa a apresentar (null para pagamentos aprovados ou pendentes) */
  reason: string | null;
  /** Motivo tal como o gateway o devolveu (auditoria) */
  gatewayMessage: string | null;
}

/**
 * Converte o estado e o motivo devolvidos pelo gateway no resultado interno. Só reclassifica entre estados finais
 * não pagos (falhou ↔ cancelado): nunca transforma um pendente num final nem toca num pagamento confirmado.
 */
export function classifyOutcome(state: NormalizedState, message?: string | null): Outcome {
  const gatewayMessage = message?.trim().replace(/\s+/g, " ").slice(0, 300) || null;
  if (state === "paid" || state === "pending") return { state, code: null, reason: null, gatewayMessage: state === "paid" ? null : gatewayMessage };
  const matched = matchFailure(gatewayMessage);
  if (matched === "CUSTOMER_CANCELLED") return { state: "canceled", code: matched, reason: FAILURE_LABELS[matched], gatewayMessage };
  if (matched === "INSUFFICIENT_FUNDS" || matched === "WRONG_PIN" || matched === "INVALID_NUMBER" || matched === "DECLINED" || matched === "GATEWAY_INTERNAL") return { state: "failed", code: matched, reason: FAILURE_LABELS[matched], gatewayMessage };
  if (matched === "TIMEOUT" || matched === "EXPIRED") return { state, code: matched, reason: FAILURE_LABELS[matched], gatewayMessage };
  if (state === "expired") return { state, code: "TIMEOUT", reason: FAILURE_LABELS.TIMEOUT, gatewayMessage };
  if (gatewayMessage) return { state, code: "GATEWAY_ERROR", reason: `${state === "canceled" ? "Cancelado" : "Falhou"}: ${gatewayMessage}`.slice(0, 200), gatewayMessage };
  return { state, code: "UNKNOWN", reason: FAILURE_LABELS.UNKNOWN, gatewayMessage: null };
}
