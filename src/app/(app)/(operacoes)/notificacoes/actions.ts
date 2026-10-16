"use server";

import { revalidatePath } from "next/cache";
import { assertId, guarded } from "@/server/actions";
import { rateLimit } from "@/server/rate-limit";
import { DomainError } from "@/server/services/products";
import { markAllRead, markRead, revokeDevice, savePrefs, sendTestNotification, type TestOutcome } from "@/server/notifications/service";
import type { NotificationPrefs } from "@/lib/notifications";

export async function markReadAction(id: string) {
  return guarded(async ({ user }) => {
    await markRead(user.id, assertId(id));
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function markAllReadAction() {
  return guarded(async ({ user }) => {
    const n = await markAllRead(user.id);
    revalidatePath("/", "layout");
    return { ok: true, message: n ? `${n} notificação(ões) marcada(s) como lida(s).` : "Não há notificações por ler." };
  });
}

export async function savePrefsAction(prefs: NotificationPrefs) {
  return guarded<NotificationPrefs>(async ({ user }) => {
    const saved = await savePrefs(user.id, prefs);
    return { ok: true, data: saved, message: "Preferências guardadas." };
  });
}

export async function revokeDeviceAction(id: string) {
  return guarded(async ({ user }) => {
    const ok = await revokeDevice(user.id, { id: assertId(id) });
    if (!ok) throw new DomainError("Dispositivo não encontrado ou já removido.");
    revalidatePath("/configuracoes");
    return { ok: true, message: "Dispositivo removido. Deixa de receber notificações push." };
  });
}

export async function sendTestAction(endpoint: string | null) {
  return guarded<TestOutcome>(async ({ user }) => {
    if (!rateLimit(`push-test:${user.id}`, 6, 5 * 60_000)) throw new DomainError("Demasiados testes seguidos. Aguarde alguns minutos.");
    const r = await sendTestNotification(user.id, typeof endpoint === "string" ? endpoint.slice(0, 1000) : null);
    revalidatePath("/", "layout");
    return { ok: true, data: r };
  });
}
