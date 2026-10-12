"use server";

import { revalidatePath } from "next/cache";
import { assertId, guarded } from "@/server/actions";
import { discardDraft, publishDesign, saveDraft } from "@/server/services/checkout-design";
import type { FieldErrors } from "@/server/validation/common";

// Todas as ações exigem sessão válida (guarded) e só atuam sobre produtos do âmbito atual.

export async function saveDesignDraftAction(productId: string, design: unknown) {
  return guarded<{ fieldErrors?: FieldErrors }>(async ({ isDemo }) => {
    const r = await saveDraft(assertId(productId), design, isDemo);
    if (!r.ok) return { ok: false, error: "Corrija os elementos assinalados antes de guardar.", fieldErrors: r.fieldErrors };
    revalidatePath("/checkouts");
    return { ok: true, message: "Rascunho guardado. O checkout publicado não foi alterado." };
  });
}

export async function publishDesignAction(productId: string, design: unknown) {
  return guarded(async ({ isDemo }) => {
    const id = assertId(productId);
    const r = await saveDraft(id, design, isDemo);
    if (!r.ok) return { ok: false, error: "Corrija os elementos assinalados antes de publicar.", fieldErrors: r.fieldErrors };
    await publishDesign(id, isDemo);
    revalidatePath("/checkouts");
    return { ok: true, message: "Personalização publicada. O link do checkout continua o mesmo." };
  });
}

export async function discardDraftAction(productId: string) {
  return guarded(async ({ isDemo }) => {
    await discardDraft(assertId(productId), isDemo);
    revalidatePath("/checkouts");
    return { ok: true, message: "Alterações descartadas." };
  });
}
