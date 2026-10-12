import type { PaymentProvider } from "./types";
import { epayProvider } from "./providers/epay";
import { testLocalProvider, testProviderAllowed } from "./providers/test-local";

// Fornecedores conhecidos. Só é usado para cobrar um fornecedor que reporte isConfigured() === true.
function providers(): PaymentProvider[] {
  return testProviderAllowed() ? [testLocalProvider, epayProvider] : [epayProvider];
}

export function getActivePaymentProvider(): PaymentProvider | null {
  return providers().find((p) => p.isConfigured()) ?? null;
}

export function getProvider(id: string): PaymentProvider | null {
  return providers().find((p) => p.id === id) ?? null;
}

export function paymentsEnabled(): boolean {
  return getActivePaymentProvider() !== null;
}
