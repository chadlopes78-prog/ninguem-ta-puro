"use server";

import { revalidatePath } from "next/cache";
import type { ProductStatus } from "@prisma/client";
import { assertId, formToObject, guarded, parseForm } from "@/server/actions";
import { offerSchema, productSchema } from "@/server/validation/schemas";
import { addOffer, createProduct, duplicateProduct, setOfferActive, setProductStatus, updateProduct } from "@/server/services/products";

export async function saveProductAction(id: string | null, fd: FormData) {
  return guarded<{ id: string }>(async ({ isDemo }) => {
    const p = parseForm(productSchema, formToObject(fd));
    if (!p.ok) return p.result;
    const product = id ? await updateProduct(assertId(id), p.data, isDemo) : await createProduct(p.data, isDemo);
    revalidatePath("/produtos");
    return { ok: true, data: { id: product.id }, message: id ? "Produto atualizado." : "Produto criado." };
  });
}

const STATUS_MESSAGES: Record<ProductStatus, string> = {
  PUBLISHED: "Produto publicado.",
  UNPUBLISHED: "Produto despublicado.",
  ARCHIVED: "Produto arquivado.",
  DRAFT: "Produto restaurado como rascunho.",
};

export async function setProductStatusAction(id: string, status: ProductStatus) {
  return guarded(async ({ isDemo }) => {
    if (!["PUBLISHED", "UNPUBLISHED", "ARCHIVED", "DRAFT"].includes(status)) return { ok: false, error: "Estado inválido." };
    await setProductStatus(assertId(id), status, isDemo);
    revalidatePath("/produtos");
    return { ok: true, message: STATUS_MESSAGES[status] };
  });
}

export async function duplicateProductAction(id: string) {
  return guarded<{ id: string }>(async ({ isDemo }) => {
    const p = await duplicateProduct(assertId(id), isDemo);
    revalidatePath("/produtos");
    return { ok: true, data: { id: p.id }, message: "Produto duplicado como rascunho." };
  });
}

export async function addOfferAction(productId: string, fd: FormData) {
  return guarded(async ({ isDemo }) => {
    const p = parseForm(offerSchema, formToObject(fd));
    if (!p.ok) return p.result;
    await addOffer(assertId(productId), p.data, isDemo);
    revalidatePath(`/produtos/${productId}`);
    return { ok: true, message: "Oferta adicionada." };
  });
}

export async function setOfferActiveAction(offerId: string, active: boolean) {
  return guarded(async ({ isDemo }) => {
    await setOfferActive(assertId(offerId), active, isDemo);
    return { ok: true, message: active ? "Oferta ativada." : "Oferta desativada." };
  });
}
