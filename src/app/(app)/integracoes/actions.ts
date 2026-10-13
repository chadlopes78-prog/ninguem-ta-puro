"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/server/actions";
import { checkIntegration, isGatewayId, setGatewayEnabled, testGatewayConnection, updateE2Credentials, updateEPayCredentials } from "@/server/services/integrations";
import { reconcilePendingPayments } from "@/server/services/payment-flow";

// Todas as ações exigem sessão válida e conta aprovada (guarded) e atuam APENAS sobre a conta da sessão:
// o id da conta nunca vem do browser. Nenhuma devolve valores de credenciais.

export async function checkIntegrationAction(provider: string) {
  return guarded(async ({ user }) => {
    if (!isGatewayId(provider)) return { ok: false, error: "Fornecedor desconhecido." };
    const r = await checkIntegration(user.id, provider);
    revalidatePath("/integracoes");
    return r.configured ? { ok: true, message: r.message } : { ok: false, error: `Não configurado: ${r.message}` };
  });
}

export async function setGatewayEnabledAction(provider: string, enabled: boolean) {
  return guarded(async ({ user }) => {
    if (!isGatewayId(provider) || typeof enabled !== "boolean") return { ok: false, error: "Pedido inválido." };
    const r = await setGatewayEnabled(user.id, provider, enabled);
    revalidatePath("/integracoes");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  });
}

export async function testGatewayConnectionAction(provider: string) {
  return guarded(async ({ user }) => {
    if (provider !== "e2payments") return { ok: false, error: "Teste de ligação não disponível para este gateway." };
    const r = await testGatewayConnection(user.id, "e2payments");
    revalidatePath("/integracoes");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  });
}

export async function saveE2CredentialsAction(fd: FormData) {
  return guarded(async ({ user }) => {
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v.slice(0, 300) : undefined;
    };
    const r = await updateE2Credentials(user.id, { clientId: get("clientId"), clientSecret: get("clientSecret"), mpesaWalletId: get("mpesaWalletId"), emolaWalletId: get("emolaWalletId") });
    revalidatePath("/integracoes");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error, fieldErrors: "fieldErrors" in r ? r.fieldErrors : undefined };
  });
}

export async function reconcileAction() {
  return guarded(async ({ user }) => {
    const r = await reconcilePendingPayments(user.id);
    revalidatePath("/pedidos");
    return { ok: true, message: `${r.checked} pagamento(s) pendente(s) verificado(s) na EPay; ${r.changed} atualizado(s).` };
  });
}

export async function saveEPayCredentialsAction(fd: FormData) {
  return guarded(async ({ user }) => {
    const v = fd.get("secretKey");
    const r = await updateEPayCredentials(user.id, { secretKey: typeof v === "string" ? v.slice(0, 300) : undefined });
    revalidatePath("/integracoes");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error, fieldErrors: "fieldErrors" in r ? r.fieldErrors : undefined };
  });
}
