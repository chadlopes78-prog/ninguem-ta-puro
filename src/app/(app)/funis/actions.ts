"use server";

import { revalidatePath } from "next/cache";
import { assertId, guarded, parseForm } from "@/server/actions";
import { funnelMetaSchema, graphSchema } from "@/server/funnels/schema";
import { createFunnel, deleteFunnel, duplicateFunnel, saveFunnel } from "@/server/services/funnels";
import { activateWizardFunnel, createWizardFunnel, deactivateWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { deleteProductFile } from "@/server/services/product-files";
import { addOffer } from "@/server/services/products";
import { offerSchema } from "@/server/validation/schemas";
import { flattenErrors } from "@/server/validation/common";
import type { FunnelValidation } from "@/lib/funnels/validate";
import type { FunnelGraph } from "@/lib/funnels/types";

export async function createFunnelAction(fd: FormData) {
  return guarded<{ id: string }>(async ({ scope }) => {
    const p = parseForm(funnelMetaSchema, { name: fd.get("name") ?? "", description: fd.get("description") ?? "" });
    if (!p.ok) return p.result;
    const f = await createFunnel(p.data, scope);
    revalidatePath("/funis");
    return { ok: true, data: { id: f.id }, message: "Funil criado com um modelo base." };
  });
}

const savePayload = funnelMetaSchema.extend({ graph: graphSchema });

export async function saveFunnelAction(id: string, payload: { name: string; description?: string; graph: FunnelGraph }) {
  return guarded<{ validation: FunnelValidation; deactivated: boolean }>(async ({ scope }) => {
    const parsed = savePayload.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: `Dados do funil inválidos: ${issue.path.join(".")} — ${issue.message}` };
    }
    const r = await saveFunnel(assertId(id), parsed.data, scope);
    revalidatePath("/funis");
    return {
      ok: true,
      data: r,
      message: r.deactivated ? "Guardado. O funil foi desativado porque contém erros." : "Funil guardado.",
    };
  });
}

export async function activateFunnelAction(id: string) {
  return guarded<{ validation: FunnelValidation }>(async ({ scope }) => {
    const v = await activateWizardFunnel(assertId(id), scope);
    revalidatePath("/funis");
    if (!v.valid) return { ok: false, error: `Não é possível ativar: ${v.errors.length} erro(s) por corrigir. ${v.errors[0]?.message ?? ""}` };
    return { ok: true, data: { validation: v }, message: "Funil ativado." };
  });
}

export async function deactivateFunnelAction(id: string) {
  return guarded(async ({ scope }) => {
    await deactivateWizardFunnel(assertId(id), scope);
    revalidatePath("/funis");
    return { ok: true, message: "Funil desativado." };
  });
}

export async function duplicateFunnelAction(id: string) {
  return guarded<{ id: string }>(async ({ scope }) => {
    const f = await duplicateFunnel(assertId(id), scope);
    revalidatePath("/funis");
    return { ok: true, data: { id: f.id }, message: "Funil duplicado." };
  });
}

export async function deleteFunnelAction(id: string) {
  return guarded(async ({ scope }) => {
    await deleteFunnel(assertId(id), scope);
    revalidatePath("/funis");
    return { ok: true, message: "Funil eliminado." };
  });
}


// ───────────── Assistente de funis (produto inicial → upsell → página de obrigado) ─────────────

export async function createWizardFunnelAction(productId: string) {
  return guarded<{ id: string }>(async ({ scope }) => {
    const f = await createWizardFunnel(assertId(productId), scope);
    revalidatePath("/funis");
    return { ok: true, data: { id: f.id }, message: "Funil criado. Configure o que acontece depois do pagamento." };
  });
}

export async function saveWizardFunnelAction(id: string, payload: unknown) {
  return guarded<{ validation: FunnelValidation; deactivated: boolean }>(async ({ scope }) => {
    const r = await saveWizardFunnel(assertId(id), payload, scope);
    if (!r.ok) return { ok: false, error: r.error, fieldErrors: r.fieldErrors };
    revalidatePath("/funis");
    return { ok: true, data: { validation: r.validation, deactivated: r.deactivated }, message: r.deactivated ? "Guardado. O funil foi desativado porque contém erros." : "Funil guardado." };
  });
}

export async function deleteProductFileAction(fileId: string) {
  return guarded(async ({ scope }) => {
    await deleteProductFile(assertId(fileId), scope);
    return { ok: true, message: "PDF eliminado." };
  });
}

/**
 * Cria um preço (oferta) para um produto da própria conta, a partir do funil (upsell/downsell).
 * Usa o mesmo serviço e a mesma validação de sempre (addOffer → produto da conta, valor em cêntimos, MZN).
 */
export async function createFunnelOfferAction(productId: string, input: { name: string; price: string; currency: string }) {
  return guarded<{ id: string; name: string; priceCents: number; currency: string }>(async ({ scope }) => {
    const p = offerSchema.safeParse({ name: input.name, priceCents: input.price, currency: input.currency, billingType: "ONE_TIME", isActive: true });
    if (!p.success) return { ok: false, error: "Corrija os campos do novo preço.", fieldErrors: flattenErrors(p.error) };
    const offer = await addOffer(assertId(productId), p.data, scope);
    revalidatePath("/funis");
    return { ok: true, data: { id: offer.id, name: offer.name, priceCents: offer.priceCents, currency: offer.currency }, message: "Preço criado para esta oferta." };
  });
}
