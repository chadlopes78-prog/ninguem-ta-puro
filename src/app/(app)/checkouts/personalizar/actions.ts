"use server";

import { revalidatePath } from "next/cache";
import { assertId, guarded } from "@/server/actions";
import { discardDraft, publishDesign, saveDraft } from "@/server/services/checkout-design";
import { publishThankYou, resetThankYou, saveThankYouDraft } from "@/server/services/thank-you-custom";
import type { FieldErrors } from "@/server/validation/common";

// Todas as ações exigem sessão válida (guarded) e só atuam sobre produtos do âmbito atual.

export async function saveDesignDraftAction(productId: string, design: unknown) {
  return guarded<{ fieldErrors?: FieldErrors }>(async ({ scope }) => {
    const r = await saveDraft(assertId(productId), design, scope);
    if (!r.ok) return { ok: false, error: "Corrija os elementos assinalados antes de guardar.", fieldErrors: r.fieldErrors };
    revalidatePath("/checkouts");
    return { ok: true, message: "Rascunho guardado. O checkout publicado não foi alterado." };
  });
}

export async function publishDesignAction(productId: string, design: unknown) {
  return guarded(async ({ scope }) => {
    const id = assertId(productId);
    const r = await saveDraft(id, design, scope);
    if (!r.ok) return { ok: false, error: "Corrija os elementos assinalados antes de publicar.", fieldErrors: r.fieldErrors };
    await publishDesign(id, scope);
    revalidatePath("/checkouts");
    return { ok: true, message: "Personalização publicada. O link do checkout continua o mesmo." };
  });
}

export async function discardDraftAction(productId: string) {
  return guarded(async ({ scope }) => {
    await discardDraft(assertId(productId), scope);
    revalidatePath("/checkouts");
    return { ok: true, message: "Alterações descartadas." };
  });
}

// ───── Página de obrigado personalizada (só aparência e textos) ─────

export async function saveThankYouDraftAction(productId: string, data: unknown) {
  return guarded<{ fieldErrors?: FieldErrors }>(async ({ scope }) => {
    const r = await saveThankYouDraft(assertId(productId), data, scope);
    if (!r.ok) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: r.fieldErrors };
    revalidatePath("/checkouts");
    return { ok: true, message: "Rascunho guardado. A página publicada não foi alterada." };
  });
}

export async function publishThankYouAction(productId: string, data: unknown) {
  return guarded<{ fieldErrors?: FieldErrors }>(async ({ scope }) => {
    const r = await publishThankYou(assertId(productId), data, scope);
    if (!r.ok) return { ok: false, error: "Corrija os campos assinalados antes de publicar.", fieldErrors: r.fieldErrors };
    revalidatePath("/checkouts");
    return { ok: true, message: "Página de obrigado publicada." };
  });
}

export async function resetThankYouAction(productId: string) {
  return guarded(async ({ scope }) => {
    await resetThankYou(assertId(productId), scope);
    revalidatePath("/checkouts");
    return { ok: true, message: "Página padrão restaurada." };
  });
}
