import { prisma } from "@/server/db";
import type { GatewayId, PaymentProvider } from "./types";
import { testLocalProvider, testProviderAllowed } from "./providers/test-local";
import { acceptsNewPayments, gatewayContext, providerFor } from "./gateways";

/**
 * Instâncias criadas com as credenciais de OUTRA conta (partilha autorizada pelo administrador) → id dessa conta.
 * Só o servidor preenche este mapa; é usado para gravar no Payment de quem são as credenciais usadas.
 */
const sharedCredentialOwner = new WeakMap<PaymentProvider, string>();

/** Conta cujas credenciais este fornecedor usa quando não são as da conta dona do checkout (senão null). */
export function credentialOwnerOf(provider: PaymentProvider): string | null {
  return sharedCredentialOwner.get(provider) ?? null;
}

/**
 * Gateway do administrador partilhado com `granteeId`: exige uma autorização ATIVA para esse gateway, dada pela
 * conta proprietária (aprovada e não suspensa), e que o gateway do administrador aceite novos pagamentos.
 */
async function sharedProviderFor(id: GatewayId, granteeId: string): Promise<PaymentProvider | null> {
  const grant = await prisma.paymentCredentialGrant.findFirst({
    where: { granteeId, provider: id, status: "ACTIVE", grantor: { role: "OWNER", status: "APPROVED", bannedAt: null } },
    select: { grantorId: true },
  });
  if (!grant || grant.grantorId === granteeId) return null;
  const ctx = await gatewayContext(grant.grantorId);
  const p = providerFor(id, ctx);
  if (!acceptsNewPayments(id, p, ctx)) return null;
  sharedCredentialOwner.set(p, grant.grantorId);
  return p;
}

/**
 * Gateways da conta `ownerId` que aceitam NOVOS pagamentos (ativados, configurados e, na E2Payments, verificados).
 * Usa as credenciais dessa conta; só quando a conta não tem esse gateway ativo e o administrador lhe deu uma
 * autorização ativa para ele, usa as credenciais do administrador (ver credentialOwnerOf). Nunca as de outra conta.
 * Ordem estável: EPay primeiro (comportamento anterior), depois E2Payments e Pagar.
 */
export async function getActivePaymentProviders(ownerId: string): Promise<PaymentProvider[]> {
  if (testProviderAllowed() && testLocalProvider.isConfigured()) return [testLocalProvider];
  const ctx = await gatewayContext(ownerId);
  const out: PaymentProvider[] = [];
  for (const id of ["epay", "e2payments", "pagar"] as const) {
    const p = providerFor(id, ctx);
    if (acceptsNewPayments(id, p, ctx)) out.push(p);
    else {
      const shared = await sharedProviderFor(id, ownerId);
      if (shared) out.push(shared);
    }
  }
  return out;
}

/**
 * Instância de um fornecedor com as credenciais da conta `ownerId`, esteja ou não ativado. Usado para confirmar
 * pagamentos já iniciados (consultas, avisos, cancelamentos): desativar um gateway não bloqueia estas operações.
 */
export async function getProvider(id: string, ownerId: string): Promise<PaymentProvider | null> {
  if (id === testLocalProvider.id) return testProviderAllowed() ? testLocalProvider : null;
  if (id !== "epay" && id !== "e2payments" && id !== "pagar") return null;
  return providerFor(id, await gatewayContext(ownerId));
}

/**
 * Fornecedor para um pagamento JÁ iniciado (consulta, aviso, cancelamento): usa as credenciais gravadas no próprio
 * pagamento (partilhadas pelo administrador) ou, como até agora, as da conta dona da encomenda. Não depende de a
 * autorização continuar ativa: revogar só impede novos pagamentos.
 */
export async function getProviderForPayment(payment: { provider: string; credentialOwnerId?: string | null }, orderOwnerId: string): Promise<PaymentProvider | null> {
  return getProvider(payment.provider, payment.credentialOwnerId ?? orderOwnerId);
}

export async function paymentsEnabled(ownerId: string): Promise<boolean> {
  return (await getActivePaymentProviders(ownerId)).length > 0;
}
