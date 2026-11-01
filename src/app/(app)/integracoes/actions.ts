"use server";

import { revalidatePath } from "next/cache";
import { assertId, guarded } from "@/server/actions";
import { checkIntegration, isGatewayId, setGatewayEnabled, testGatewayConnection, updateE2Credentials, updateEPayCredentials, updatePagarCredentials, setPagarMode } from "@/server/services/integrations";
import { reconcilePendingPayments } from "@/server/services/payment-flow";
import { deleteMetaPixel, saveMetaPixel, setMetaPixelsEnabled } from "@/server/services/meta-capi";
import { scopeOf } from "@/server/scope";
import { savePagarDomain } from "@/server/services/pagar-domain";

// Todas as ações exigem sessão válida e conta aprovada (guarded) e atuam APENAS sobre a conta da sessão:
// o id da conta nunca vem do browser. Nenhuma devolve valores de credenciais.

export async function checkIntegrationAction(provider: string) {
  return guarded(async ({ user }) => {
    if (!isGatewayId(provider)) return { ok: false, error: "Fornecedor desconhecido." };
    const r = await checkIntegration(user.id, provider);
    revalidatePath("/integracoes", "layout");
    return r.configured ? { ok: true, message: r.message } : { ok: false, error: `Não configurado: ${r.message}` };
  });
}

export async function setGatewayEnabledAction(provider: string, enabled: boolean) {
  return guarded(async ({ user }) => {
    if (!isGatewayId(provider) || typeof enabled !== "boolean") return { ok: false, error: "Pedido inválido." };
    const r = await setGatewayEnabled(user.id, provider, enabled);
    revalidatePath("/integracoes", "layout");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  });
}

export async function testGatewayConnectionAction(provider: string) {
  return guarded(async ({ user }) => {
    if (provider !== "e2payments" && provider !== "pagar") return { ok: false, error: "Teste de ligação não disponível para este gateway." };
    const r = await testGatewayConnection(user.id, provider);
    revalidatePath("/integracoes", "layout");
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
    revalidatePath("/integracoes", "layout");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error, fieldErrors: "fieldErrors" in r ? r.fieldErrors : undefined };
  });
}

/** Credenciais da Pagar DESTA conta (cifradas no servidor; campos em branco mantêm o valor guardado). */
export async function savePagarCredentialsAction(fd: FormData) {
  return guarded(async ({ user }) => {
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v.slice(0, 300) : undefined;
    };
    const r = await updatePagarCredentials(user.id, { mode: get("mode"), apiKey: get("apiKey"), signingSecret: get("signingSecret"), webhookSecret: get("webhookSecret") });
    revalidatePath("/integracoes", "layout");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error, fieldErrors: "fieldErrors" in r ? r.fieldErrors : undefined };
  });
}

/** Modo da Pagar DESTA conta: teste (simulado) ou real (dinheiro real; exige confirmação). */
export async function setPagarModeAction(mode: string, confirmLive: boolean) {
  return guarded(async ({ user }) => {
    if (mode !== "test" && mode !== "live") return { ok: false, error: "Modo inválido." };
    const r = await setPagarMode(user.id, mode, confirmLive === true);
    revalidatePath("/integracoes", "layout");
    revalidatePath("/checkout", "layout");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
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
    revalidatePath("/integracoes", "layout");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error, fieldErrors: "fieldErrors" in r ? r.fieldErrors : undefined };
  });
}

// ───── Facebook Pixel / API de Conversões ─────
// Sempre a conta real da sessão (como os gateways): só as vendas reais são enviadas. O token nunca é devolvido.

export async function saveMetaPixelAction(fd: FormData) {
  return guarded(async ({ user }) => {
    const str = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v.slice(0, 1100) : undefined;
    };
    const productIds = fd.getAll("productIds").filter((v): v is string => typeof v === "string").slice(0, 500);
    const r = await saveMetaPixel(scopeOf(user.id, false), {
      id: str("id") || undefined,
      pixelId: str("pixelId") ?? "",
      token: str("token") ?? "",
      testEventCode: str("testEventCode") ?? "",
      enabled: fd.get("enabled") === "on",
      productIds,
    });
    revalidatePath("/integracoes", "layout");
    return r.ok ? { ok: true, message: "Pixel guardado." } : { ok: false, error: r.error, fieldErrors: r.fieldErrors };
  });
}

export async function deleteMetaPixelAction(id: string) {
  return guarded(async ({ user }) => {
    if (typeof id !== "string" || !/^[a-z0-9]{10,40}$/i.test(id)) return { ok: false, error: "Pedido inválido." };
    await deleteMetaPixel(scopeOf(user.id, false), id);
    revalidatePath("/integracoes", "layout");
    return { ok: true, message: "Pixel removido. Deixam de ser enviados eventos para este Pixel." };
  });
}

export async function setMetaEnabledAction(enabled: boolean) {
  return guarded(async ({ user }) => {
    if (typeof enabled !== "boolean") return { ok: false, error: "Pedido inválido." };
    const n = await setMetaPixelsEnabled(scopeOf(user.id, false), enabled);
    revalidatePath("/integracoes", "layout");
    if (!n) return { ok: false, error: "Configure primeiro um Pixel." };
    return { ok: true, message: enabled ? "Pixel da Meta ativado." : "Pixel da Meta desativado. Nenhum evento é enviado." };
  });
}

/** Integração disponibilizada pelo administrador: o utilizador só pode pedir a remoção (o administrador decide). */
export async function requestGrantRemovalAction(grantId: string) {
  return guarded(async ({ user }) => {
    const { requestGrantRemoval } = await import("@/server/services/credential-grants");
    await requestGrantRemoval(user.id, assertId(grantId));
    revalidatePath("/integracoes");
    return { ok: true, message: "Pedido enviado. O administrador foi informado." };
  });
}

/** Token de verificação do domínio da Pagar DESTA conta (público por natureza) e o hostname onde é publicado. */
export async function savePagarDomainAction(fd: FormData) {
  return guarded(async ({ user }) => {
    const get = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v.slice(0, 300) : undefined;
    };
    const r = await savePagarDomain(user.id, { host: get("host"), token: get("token") });
    revalidatePath("/integracoes", "layout");
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.error, fieldErrors: "fieldErrors" in r ? r.fieldErrors : undefined };
  });
}
