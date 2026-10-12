import type { PaymentProvider } from "./types";

// Nenhum processador está registado nesta fase. Para adicionar um fornecedor:
// 1. Implementar PaymentProvider em src/server/payments/providers/<id>.ts
// 2. Ler segredos apenas de variáveis de ambiente (ex.: PAYMENTS_WEBHOOK_SECRET_<ID>)
// 3. Registar aqui e marcar a integração como configurada após validação real.
const providers: PaymentProvider[] = [];

export function getActivePaymentProvider(): PaymentProvider | null {
  return providers.find((p) => p.isConfigured()) ?? null;
}

export function getProvider(id: string): PaymentProvider | null {
  return providers.find((p) => p.id === id) ?? null;
}

export function paymentsEnabled(): boolean {
  return getActivePaymentProvider() !== null;
}
