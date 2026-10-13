import type { PaymentProvider } from "./types";
import { testLocalProvider, testProviderAllowed } from "./providers/test-local";
import { acceptsNewPayments, gatewayRows, providerFor } from "./gateways";

/**
 * Gateways que aceitam NOVOS pagamentos neste momento (ativados, configurados e, na E2Payments, com ligação verificada).
 * Ordem estável: EPay primeiro (comportamento anterior), depois E2Payments.
 */
export async function getActivePaymentProviders(): Promise<PaymentProvider[]> {
  if (testProviderAllowed() && testLocalProvider.isConfigured()) return [testLocalProvider];
  const rows = await gatewayRows();
  const out: PaymentProvider[] = [];
  for (const id of ["epay", "e2payments"] as const) {
    const p = providerFor(id, rows);
    if (acceptsNewPayments(id, p, rows.get(id))) out.push(p);
  }
  return out;
}

/**
 * Instância de um fornecedor pelo id, esteja ou não ativado. Usado para confirmar pagamentos já iniciados
 * (consultas de estado, notificações, cancelamentos): desativar um gateway não bloqueia estas operações.
 */
export async function getProvider(id: string): Promise<PaymentProvider | null> {
  if (id === testLocalProvider.id) return testProviderAllowed() ? testLocalProvider : null;
  if (id !== "epay" && id !== "e2payments") return null;
  return providerFor(id, await gatewayRows());
}

export async function paymentsEnabled(): Promise<boolean> {
  return (await getActivePaymentProviders()).length > 0;
}
