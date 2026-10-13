"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/server/actions";
import { checkIntegration, isGatewayId, setGatewayEnabled, testGatewayConnection, updateE2Credentials } from "@/server/services/integrations";
import { reconcilePendingPayments } from "@/server/services/payment-flow";

// Todas as ações exigem sessão válida no servidor (guarded). Nenhuma devolve valores de credenciais.

export async function checkIntegrationAction(provider: string) {
  return guarded(async () => {
    if (!isGatewayId(provider)) return { ok: false, error: "Fornecedor desconhecido." };
    const r = await checkIntegration(provider);
    revalidatePath("/integracoes");
    return r.configured ? { ok: true, message: r.message } : { ok: false, error: `Não configurado: ${r.message}` };
  });
}

export async function setGatewayEnabledAction(provider: string, enabled: boolean) {
  return guarded(async () => {
    if (!isGatewayId(provider) || typeof enabled !== "boolean") return { ok: false, error: "Pedido inválido." };
    const r = await setGatewayEnabled(provider, enabled);
    revalidatePath("/integracoes");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  });
}

export async function testGatewayConnectionAction(provider: string) {
  return guarded(async () => {
    if (provider !== "e2payments") return { ok: false, error: "Teste de ligação não disponível para este gateway." };
    const r = await testGatewayConnection("e2payments");
    revalidatePath("/integracoes");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  });
}

export async function saveE2CredentialsAction(fd: FormData) {
  return guarded(async () => {
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v.slice(0, 300) : undefined;
    };
    const r = await updateE2Credentials({ clientId: get("clientId"), clientSecret: get("clientSecret"), mpesaWalletId: get("mpesaWalletId"), emolaWalletId: get("emolaWalletId") });
    revalidatePath("/integracoes");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error, fieldErrors: "fieldErrors" in r ? r.fieldErrors : undefined };
  });
}

export async function reconcileAction() {
  return guarded(async () => {
    const r = await reconcilePendingPayments();
    revalidatePath("/pedidos");
    return { ok: true, message: `${r.checked} pagamento(s) pendente(s) verificado(s) na EPay; ${r.changed} atualizado(s).` };
  });
}
