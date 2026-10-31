// Classificação normalizada do resultado de um pagamento, igual para todos os gateways.
//
// Cada gateway devolve os motivos à sua maneira (texto livre, códigos próprios ou nada). Aqui só se lê o que o
// gateway efetivamente devolveu — nunca se inventa um motivo:
//   - Pagar: todos os campos de diagnóstico do objeto pagamento (`failureReason`, `safeMessage` e outros códigos/
//     mensagens que venham na resposta ou no aviso assinado) — docs/pagar-api.md, secções 05–06. A Pagar documenta
//     que um pagamento é CANCELLED também «após três minutos sem confirmação» (expiração).
//   - E2Payments: `message` da resposta HTTP 400 do pedido C2B (docs/e2payments-api.md), onde a operadora pode
//     repassar os códigos da API M-Pesa;
//   - EPay: o objeto pagamento só tem `status` (pending/paid/failed/cancelled) e não traz motivo; `cancelled`
//     significa «cancelado pela loja ou reembolsado» (docs/epay-api.md), nunca «pelo cliente».
// Códigos de resposta da API M-Pesa (Vodacom Moçambique), quando o gateway os repassa: INS-1 erro interno,
// INS-5 cancelada pelo cliente, INS-6 transação falhada, INS-9 tempo de pedido excedido, INS-16 sobrecarga
// temporária, INS-995/INS-996 perfil/conta do cliente com problemas ou inativa, INS-2006 saldo insuficiente,
// INS-2051 MSISDN inválido. Os códigos da e-Mola não estão documentados aqui: só se reconhece o texto.
// Sem padrão reconhecido, a justificativa é o motivo real devolvido pelo gateway; sem motivo, diz-se que o
// gateway não o indicou.
import type { NormalizedState } from "./types";

export type FailureCode =
  | "CUSTOMER_CANCELLED"
  | "INSUFFICIENT_FUNDS"
  | "WRONG_PIN"
  | "INVALID_NUMBER"
  | "ACCOUNT_INACTIVE"
  | "EXPIRED"
  | "TIMEOUT"
  | "DECLINED"
  | "GATEWAY_INTERNAL"
  | "GATEWAY_ERROR"
  | "NOT_STARTED"
  | "UNKNOWN";

/** Justificativa nas Operações (para o vendedor). */
export const FAILURE_LABELS: Record<FailureCode, string> = {
  CUSTOMER_CANCELLED: "Cancelado pelo cliente",
  INSUFFICIENT_FUNDS: "Saldo insuficiente na carteira do cliente",
  WRONG_PIN: "PIN incorrecto",
  INVALID_NUMBER: "Número inválido ou sem carteira móvel activa",
  ACCOUNT_INACTIVE: "Conta da carteira do cliente inactiva ou com restrições",
  EXPIRED: "Expirado: o cliente não confirmou a tempo",
  TIMEOUT: "Tempo de espera excedido",
  DECLINED: "Recusado pelo operador",
  GATEWAY_INTERNAL: "Erro temporário do gateway/operador",
  GATEWAY_ERROR: "Erro do gateway",
  NOT_STARTED: "Pagamento não iniciado pelo gateway",
  UNKNOWN: "O gateway não indicou o motivo",
};

/** Mensagem para o comprador (clara, sem termos técnicos e sem culpar o cliente quando o motivo não é conhecido). */
export const BUYER_MESSAGES: Record<FailureCode, string> = {
  CUSTOMER_CANCELLED: "Pagamento cancelado. Pode iniciar uma nova tentativa quando desejar.",
  INSUFFICIENT_FUNDS: "Saldo insuficiente na sua carteira. Recarregue e tente novamente.",
  WRONG_PIN: "PIN incorrecto. Verifique o seu PIN e tente novamente.",
  INVALID_NUMBER: "O número de telefone introduzido não é válido.",
  ACCOUNT_INACTIVE: "A sua carteira móvel não está activa ou tem restrições. Contacte a operadora ou use outro número.",
  EXPIRED: "O tempo para confirmar o pagamento expirou. Inicie uma nova tentativa.",
  TIMEOUT: "O tempo para confirmar o pagamento expirou. Inicie uma nova tentativa.",
  DECLINED: "A operadora recusou o pagamento. Pode tentar novamente.",
  GATEWAY_INTERNAL: "O serviço de pagamentos está temporariamente indisponível. Tente novamente dentro de instantes.",
  GATEWAY_ERROR: "O pagamento não foi concluído. Pode tentar novamente.",
  NOT_STARTED: "O pagamento não foi iniciado. Pode tentar novamente.",
  UNKNOWN: "O pagamento não foi concluído. Pode tentar novamente.",
};

const SEP = "[\\s_-]+";
const PATTERNS: [FailureCode, RegExp][] = [
  // a ordem importa: saldo antes de "falhou", cancelamento antes de "tempo excedido", específicos antes de "recusado"
  ["INSUFFICIENT_FUNDS", /\bINS-2006\b|saldo\s+insuficiente|fundos\s+insuficientes|sem\s+saldo|insufficient[\s_-]*(balance|funds)|not[\s_-]+enough[\s_-]+(balance|funds)|NSF\b/i],
  ["WRONG_PIN", new RegExp(`\\bpin\\b[^.]{0,30}\\b(incorrect|incorrecto|incorreto|inv[aá]lido|invalid|errado|wrong)|\\b(incorrect|invalid|wrong)${SEP}pin\\b`, "i")],
  [
    "CUSTOMER_CANCELLED",
    new RegExp(
      `\\bINS-5\\b|cancel+ad[oa]\\s+pelo\\s+(cliente|utilizador|usu[aá]rio|comprador|assinante)|rejeitad[oa]\\s+pelo\\s+(cliente|utilizador|usu[aá]rio|comprador)|recusad[oa]\\s+pelo\\s+(cliente|utilizador|usu[aá]rio|comprador)|(cancel+ed|rejected|declined)${SEP}by${SEP}(the${SEP})?(user|customer|subscriber|payer|client)|(user|customer|subscriber|payer)${SEP}(cancel+ed|rejected|declined)`,
      "i",
    ),
  ],
  ["INVALID_NUMBER", /\bINS-(2051|2057)\b|invalid[\s_-]*(msisdn|phone|number|mobile|payer)|(msisdn|phone\s*number|subscriber|wallet|account)\s+(not\s+found|not\s+registered|does\s+not\s+exist|is\s+invalid)|n[uú]mero\s+(inv[aá]lido|n[aã]o\s+registado|incorrecto|incorreto)|sem\s+(conta|carteira)/i],
  ["ACCOUNT_INACTIVE", /\bINS-(4|995|996)\b|(customer|user|account|subscriber|wallet)[\s_-]+(is[\s_-]+)?(not[\s_-]+active|inactive|blocked|suspended|barred)|(conta|carteira)\s+(inactiva|inativa|bloqueada|suspensa)/i],
  ["EXPIRED", /\bexpired\b|expirad[oa]/i],
  ["TIMEOUT", /\bINS-9\b|time[\s_-]?out|timed\s+out|tempo\s+(de\s+(espera|resposta)\s+)?(excedido|esgotado)/i],
  ["GATEWAY_INTERNAL", /\bINS-(1|16)\b|internal[\s_-]+(server[\s_-]+)?error|erro\s+interno|service[\s_-]+unavailable|temporar(il)?y[\s_-]+(unavailable|overload)|servi[cç]o\s+indispon[ií]vel|temporariamente\s+indispon[ií]vel|\bHTTP\s+5\d\d\b/i],
  // recusa sem causa específica («Payment was declined», «Transaction failed», INS-6): recusada pelo operador
  ["DECLINED", /\bINS-6\b|\b(was\s+)?declined\b|\brejected\b|transaction[\s_-]+failed|payment[\s_-]+failed|recusad[oa]|rejeitad[oa]|transa[cç][aã]o\s+falhada/i],
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
  /** Justificativa a apresentar nas Operações (null para pagamentos aprovados ou pendentes) */
  reason: string | null;
  /** Motivo tal como o gateway o devolveu (auditoria) */
  gatewayMessage: string | null;
}

export interface ClassifyOptions {
  /** O gateway documenta que cancela sozinho os pagamentos não confirmados ao fim deste tempo (Pagar: 3 min) */
  autoCancelAfterMs?: number | null;
  /** Tempo desde a criação do pagamento */
  ageMs?: number;
}

/**
 * Converte o estado e o motivo devolvidos pelo gateway no resultado interno. Só reclassifica entre estados finais
 * não pagos (falhou ↔ cancelado ↔ expirado): nunca transforma um pendente num final nem toca num pagamento confirmado.
 */
export function classifyOutcome(state: NormalizedState, message?: string | null, opts: ClassifyOptions = {}): Outcome {
  const gatewayMessage = message?.trim().replace(/\s+/g, " ").slice(0, 300) || null;
  if (state === "paid" || state === "pending") return { state, code: null, reason: null, gatewayMessage: state === "paid" ? null : gatewayMessage };
  const matched = matchFailure(gatewayMessage);
  if (matched === "CUSTOMER_CANCELLED") return { state: "canceled", code: matched, reason: FAILURE_LABELS[matched], gatewayMessage };
  if (matched === "INSUFFICIENT_FUNDS" || matched === "WRONG_PIN" || matched === "INVALID_NUMBER" || matched === "ACCOUNT_INACTIVE" || matched === "DECLINED" || matched === "GATEWAY_INTERNAL") {
    return { state: "failed", code: matched, reason: FAILURE_LABELS[matched], gatewayMessage };
  }
  if (matched === "TIMEOUT" || matched === "EXPIRED") return { state, code: matched, reason: FAILURE_LABELS[matched], gatewayMessage };
  if (state === "expired") return { state, code: "TIMEOUT", reason: FAILURE_LABELS.TIMEOUT, gatewayMessage };
  // cancelado sem motivo depois do prazo em que o gateway cancela sozinho (documentado): expirou por falta de confirmação
  if (state === "canceled" && !gatewayMessage && opts.autoCancelAfterMs && (opts.ageMs ?? 0) >= opts.autoCancelAfterMs - 15_000) {
    return { state, code: "EXPIRED", reason: FAILURE_LABELS.EXPIRED, gatewayMessage: null };
  }
  if (gatewayMessage) return { state, code: "GATEWAY_ERROR", reason: `${state === "canceled" ? "Cancelado" : "Falhou"}: ${gatewayMessage}`.slice(0, 200), gatewayMessage };
  return { state, code: "UNKNOWN", reason: FAILURE_LABELS.UNKNOWN, gatewayMessage: null };
}

/**
 * Mensagem para o comprador. Para recusas sem causa conhecida usa a mensagem segura devolvida pelo próprio gateway
 * (ex.: `safeMessage` da Pagar, feita para ser mostrada ao cliente), nunca o texto técnico.
 */
export function buyerFailureMessage(code: string | null | undefined, gatewayBuyerMessage?: string | null): string {
  const c = (code && code in BUYER_MESSAGES ? code : "UNKNOWN") as FailureCode;
  const generic = c === "DECLINED" || c === "GATEWAY_ERROR" || c === "UNKNOWN";
  const safe = gatewayBuyerMessage?.trim().replace(/\s+/g, " ").slice(0, 200);
  if (generic && safe && /[a-zà-ú]/i.test(safe)) return safe;
  return BUYER_MESSAGES[c];
}
