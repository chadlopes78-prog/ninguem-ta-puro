"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formToObject, guarded, parseForm } from "@/server/actions";
import { settingsSchema } from "@/server/validation/schemas";
import { demoToolsEnabled, setDemoMode, updateSettings } from "@/server/services/settings";
import { clearDemoData, seedDemoData } from "@/server/services/demo";
import { changePassword } from "@/server/auth/service";

export async function saveSettingsAction(fd: FormData) {
  return guarded(async () => {
    const p = parseForm(settingsSchema, formToObject(fd));
    if (!p.ok) return p.result;
    await updateSettings(p.data);
    revalidatePath("/", "layout");
    return { ok: true, message: "Configurações guardadas." };
  });
}

export async function setDemoModeAction(enabled: boolean) {
  return guarded(async () => {
    await setDemoMode(enabled);
    revalidatePath("/", "layout");
    return { ok: true, message: enabled ? "Modo de demonstração ativado — a mostrar apenas dados fictícios." : "Modo de demonstração desativado — a mostrar dados reais." };
  });
}

export async function seedDemoAction() {
  return guarded(async ({ settings }) => {
    if (!demoToolsEnabled()) return { ok: false, error: "As ferramentas de demonstração estão desativadas neste ambiente (DEMO_TOOLS_ENABLED)." };
    await seedDemoData(new Date(), settings.defaultCurrency);
    await setDemoMode(true);
    revalidatePath("/", "layout");
    return { ok: true, message: "Dados de demonstração gerados e modo de demonstração ativado." };
  });
}

export async function clearDemoAction() {
  return guarded(async () => {
    await clearDemoData();
    revalidatePath("/", "layout");
    return { ok: true, message: "Todos os dados de demonstração foram removidos." };
  });
}

const pwSchema = z
  .object({ current: z.string().min(1, "Obrigatório"), next: z.string().min(10, "Mínimo de 10 caracteres").max(200), confirm: z.string() })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "As passwords não coincidem" });

export async function changePasswordAction(fd: FormData) {
  return guarded(async ({ user }) => {
    const p = parseForm(pwSchema, formToObject(fd));
    if (!p.ok) return p.result;
    const ok = await changePassword(user.id, p.data.current, p.data.next);
    if (!ok) return { ok: false, error: "Password atual incorreta.", fieldErrors: { current: "Password atual incorreta" } };
    return { ok: true, message: "Password alterada. Todas as sessões foram terminadas — inicie sessão novamente." };
  });
}
