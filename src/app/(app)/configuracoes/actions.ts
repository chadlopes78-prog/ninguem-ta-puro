"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formToObject, guarded, parseForm } from "@/server/actions";
import { cookies } from "next/headers";
import { accountSettingsSchema } from "@/server/validation/schemas";
import { demoToolsEnabled, setDemoMode, updateAccountSettings } from "@/server/services/settings";
import { LOCALE_COOKIE } from "@/lib/panel-theme";
import { clearDemoData, seedDemoData } from "@/server/services/demo";
import { changePassword } from "@/server/auth/service";
import { clearSalesHistory, type ClearMode } from "@/server/services/sales-history";

export async function saveSettingsAction(fd: FormData) {
  return guarded(async ({ user }) => {
    const p = parseForm(accountSettingsSchema, formToObject(fd));
    if (!p.ok) return p.result;
    // configurações da conta autenticada (nunca de outra conta)
    await updateAccountSettings(user.id, p.data);
    // idioma da página (atributo lang) — lido pelo layout raiz
    (await cookies()).set(LOCALE_COOKIE, p.data.locale, { path: "/", sameSite: "lax", maxAge: 365 * 24 * 3600 });
    revalidatePath("/", "layout");
    return { ok: true, message: "Configurações guardadas." };
  });
}

export async function setDemoModeAction(enabled: boolean) {
  return guarded(async ({ user }) => {
    await setDemoMode(user.id, enabled === true);
    revalidatePath("/", "layout");
    return { ok: true, message: enabled ? "Modo de demonstração ativado — a mostrar apenas dados fictícios." : "Modo de demonstração desativado — a mostrar dados reais." };
  });
}

export async function seedDemoAction() {
  return guarded(async ({ settings, user }) => {
    if (!demoToolsEnabled()) return { ok: false, error: "As ferramentas de demonstração estão desativadas neste ambiente (DEMO_TOOLS_ENABLED)." };
    // dados de demonstração só da conta autenticada
    await seedDemoData(user.id, new Date(), settings.defaultCurrency);
    await setDemoMode(user.id, true);
    revalidatePath("/", "layout");
    return { ok: true, message: "Dados de demonstração gerados e modo de demonstração ativado." };
  });
}

export async function clearDemoAction() {
  return guarded(async ({ user }) => {
    await clearDemoData(user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: "Todos os dados de demonstração foram removidos." };
  });
}

const pwSchema = z
  .object({ current: z.string().min(1, "Obrigatório"), next: z.string().min(10, "Mínimo de 10 caracteres").max(200), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "As palavras-passe não coincidem" });

export async function changePasswordAction(fd: FormData) {
  return guarded(async ({ user }) => {
    const p = parseForm(pwSchema, formToObject(fd));
    if (!p.ok) return p.result;
    const ok = await changePassword(user.id, p.data.current, p.data.next);
    if (!ok) return { ok: false, error: "Palavra-passe atual incorreta.", fieldErrors: { current: "Palavra-passe atual incorreta" } };
    return { ok: true, message: "Palavra-passe alterada. Todas as sessões foram terminadas — inicie sessão novamente." };
  });
}

/** Limpa o histórico de vendas REAL da conta autenticada (os dados de demonstração têm a sua própria opção). */
export async function clearSalesHistoryAction(mode: ClearMode) {
  return guarded(async ({ user }) => {
    if (mode !== "test" && mode !== "all") return { ok: false, error: "Opção inválida." };
    const n = await clearSalesHistory(user.id, mode);
    revalidatePath("/", "layout");
    if (!n && mode === "test") return { ok: true, message: "Não havia pagamentos de teste para limpar." };
    return { ok: true, message: mode === "all" ? `Histórico limpo: ${n} pedido(s) eliminado(s). O Dashboard recomeça do zero.` : `${n} pagamento(s) de teste eliminado(s).` };
  });
}
