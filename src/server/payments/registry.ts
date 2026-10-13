import type { PaymentProvider } from "./types";
import { testLocalProvider, testProviderAllowed } from "./providers/test-local";
import { acceptsNewPayments, gatewayContext, providerFor } from "./gateways";

/**
 * Gateways da conta `ownerId` que aceitam NOVOS pagamentos (ativados, configurados e, na E2Payments, verificados).
 * Usa exclusivamente as credenciais dessa conta: nunca as de outra conta nem as da conta proprietária como recurso.
 * Ordem estável: EPay primeiro (comportamento anterior), depois E2Payments.
 */
export async function getActivePaymentProviders(ownerId: string): Promise<PaymentProvider[]> {
  if (testProviderAllowed() && testLocalProvider.isConfigured()) return [testLocalProvider];
  const ctx = await gatewayContext(ownerId);
  const out: PaymentProvider[] = [];
  for (const id of ["epay", "e2payments"] as const) {
    const p = providerFor(id, ctx);
    if (acceptsNewPayments(id, p, ctx)) out.push(p);
  }
  return out;
}

/**
 * Instância de um fornecedor com as credenciais da conta `ownerId`, esteja ou não ativado. Usado para confirmar
 * pagamentos já iniciados (consultas, avisos, cancelamentos): desativar um gateway não bloqueia estas operações.
 */
export async function getProvider(id: string, ownerId: string): Promise<PaymentProvider | null> {
  if (id === testLocalProvider.id) return testProviderAllowed() ? testLocalProvider : null;
  if (id !== "epay" && id !== "e2payments") return null;
  return providerFor(id, await gatewayContext(ownerId));
}

export async function paymentsEnabled(ownerId: string): Promise<boolean> {
  return (await getActivePaymentProviders(ownerId)).length > 0;
}
