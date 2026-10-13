"use server";

import { revalidatePath } from "next/cache";
import { assertId, formToObject, guarded, parseForm } from "@/server/actions";
import { checkoutSchema } from "@/server/validation/schemas";
import { createCheckout, deleteCheckout, duplicateCheckout, setCheckoutActive, updateCheckout } from "@/server/services/checkouts";

export async function saveCheckoutAction(id: string | null, fd: FormData) {
  return guarded<{ id: string }>(async ({ scope }) => {
    const p = parseForm(checkoutSchema, formToObject(fd));
    if (!p.ok) return p.result;
    const c = id ? await updateCheckout(assertId(id), p.data, scope) : await createCheckout(p.data, scope);
    revalidatePath("/checkouts");
    return { ok: true, data: { id: c.id }, message: id ? "Checkout atualizado." : "Checkout criado. O link público já está disponível." };
  });
}

export async function setCheckoutActiveAction(id: string, active: boolean) {
  return guarded(async ({ scope }) => {
    await setCheckoutActive(assertId(id), active, scope);
    revalidatePath("/checkouts");
    return { ok: true, message: active ? "Checkout ativado." : "Checkout desativado. O link deixa de estar disponível." };
  });
}

export async function duplicateCheckoutAction(id: string) {
  return guarded<{ id: string }>(async ({ scope }) => {
    const c = await duplicateCheckout(assertId(id), scope);
    revalidatePath("/checkouts");
    return { ok: true, data: { id: c.id }, message: "Checkout duplicado (inativo, com novo link)." };
  });
}

export async function deleteCheckoutAction(id: string) {
  return guarded(async ({ scope }) => {
    await deleteCheckout(assertId(id), scope);
    revalidatePath("/checkouts");
    return { ok: true, message: "Checkout eliminado." };
  });
}
