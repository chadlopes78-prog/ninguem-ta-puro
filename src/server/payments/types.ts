// Abstração de processadores de pagamento (preparação — nenhum processador real está integrado).
import type { CurrencyCode } from "@/lib/money";

export interface ChargeRequest {
  orderId: string;
  orderCode: string;
  amountCents: number;
  currency: CurrencyCode;
  customer: { name: string; email: string };
  returnUrl: string;
}

export type ChargeResult =
  | { kind: "redirect"; url: string; externalRef: string }
  | { kind: "pending"; externalRef: string }
  | { kind: "error"; message: string };

/** Evento normalizado após verificação de assinatura. */
export interface NormalizedPaymentEvent {
  externalEventId: string;
  type: "payment.approved" | "payment.declined" | "payment.refunded" | "payment.canceled" | "other";
  externalRef: string | null;
  orderCode: string | null;
  amountCents: number | null;
  currency: CurrencyCode | null;
  feeCents: number | null;
}

export interface PaymentProvider {
  id: string;
  displayName: string;
  /** Verdadeiro apenas quando credenciais existem E foram validadas. */
  isConfigured(): boolean;
  createCharge(req: ChargeRequest): Promise<ChargeResult>;
  /** Deve verificar a assinatura com o segredo do ambiente usando comparação em tempo constante. */
  verifySignature(rawBody: string, headers: Headers): boolean;
  parseEvent(rawBody: string): NormalizedPaymentEvent;
}

/** Catálogo informativo de fornecedores candidatos (sem APIs nem credenciais inventadas). */
export const PROVIDER_CATALOG = [
  { id: "stripe", name: "Stripe", regions: "Global", methods: "Cartão, carteiras digitais" },
  { id: "mercadopago", name: "Mercado Pago", regions: "América Latina", methods: "Pix, cartão, boleto" },
  { id: "pagarme", name: "Pagar.me", regions: "Brasil", methods: "Pix, cartão, boleto" },
  { id: "ifthenpay", name: "ifthenpay", regions: "Portugal", methods: "MB WAY, Multibanco" },
] as const;
