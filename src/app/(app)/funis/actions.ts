"use server";

import { revalidatePath } from "next/cache";
import { assertId, guarded, parseForm } from "@/server/actions";
import { funnelMetaSchema, graphSchema } from "@/server/funnels/schema";
import { activateFunnel, createFunnel, deactivateFunnel, deleteFunnel, duplicateFunnel, saveFunnel } from "@/server/services/funnels";
import type { FunnelValidation } from "@/lib/funnels/validate";
import type { FunnelGraph } from "@/lib/funnels/types";

export async function createFunnelAction(fd: FormData) {
  return guarded<{ id: string }>(async ({ isDemo }) => {
    const p = parseForm(funnelMetaSchema, { name: fd.get("name") ?? "", description: fd.get("description") ?? "" });
    if (!p.ok) return p.result;
    const f = await createFunnel(p.data, isDemo);
    revalidatePath("/funis");
    return { ok: true, data: { id: f.id }, message: "Funil criado com um modelo base." };
  });
}

const savePayload = funnelMetaSchema.extend({ graph: graphSchema });

export async function saveFunnelAction(id: string, payload: { name: string; description?: string; graph: FunnelGraph }) {
  return guarded<{ validation: FunnelValidation; deactivated: boolean }>(async ({ isDemo }) => {
    const parsed = savePayload.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: `Dados do funil inválidos: ${issue.path.join(".")} — ${issue.message}` };
    }
    const r = await saveFunnel(assertId(id), parsed.data, isDemo);
    revalidatePath("/funis");
    return {
      ok: true,
      data: r,
      message: r.deactivated ? "Guardado. O funil foi desativado porque contém erros." : "Funil guardado.",
    };
  });
}

export async function activateFunnelAction(id: string) {
  return guarded<{ validation: FunnelValidation }>(async ({ isDemo }) => {
    const v = await activateFunnel(assertId(id), isDemo);
    revalidatePath("/funis");
    if (!v.valid) return { ok: false, error: `Não é possível ativar: ${v.errors.length} erro(s) por corrigir. ${v.errors[0]?.message ?? ""}` };
    return { ok: true, data: { validation: v }, message: "Funil ativado." };
  });
}

export async function deactivateFunnelAction(id: string) {
  return guarded(async ({ isDemo }) => {
    await deactivateFunnel(assertId(id), isDemo);
    revalidatePath("/funis");
    return { ok: true, message: "Funil desativado." };
  });
}

export async function duplicateFunnelAction(id: string) {
  return guarded<{ id: string }>(async ({ isDemo }) => {
    const f = await duplicateFunnel(assertId(id), isDemo);
    revalidatePath("/funis");
    return { ok: true, data: { id: f.id }, message: "Funil duplicado." };
  });
}

export async function deleteFunnelAction(id: string) {
  return guarded(async ({ isDemo }) => {
    await deleteFunnel(assertId(id), isDemo);
    revalidatePath("/funis");
    return { ok: true, message: "Funil eliminado." };
  });
}

