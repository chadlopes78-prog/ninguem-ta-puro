"use server";

import { revalidatePath } from "next/cache";
import type { ProductStatus } from "@prisma/client";
import { assertId, formToObject, guarded, parseForm } from "@/server/actions";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, duplicateProduct, publishProduct, setProductStatus, updateProduct } from "@/server/services/products";
import { PublishBlockedError } from "@/server/services/product-readiness";
import { removeProductDeliveryFile } from "@/server/services/product-files";
import { checkProductPixel, setProductPixel } from "@/server/services/meta-capi";
import { setProductUpsellUrl, validUpsellUrl } from "@/server/services/product-upsell";

const blockedMessage = (e: PublishBlockedError) => `Ainda não é possível publicar. Falta: ${e.missing.map((m) => m.label.toLowerCase()).join(", ")}.`;

export async function saveProductAction(id: string | null, fd: FormData) {
  return guarded<{ id: string }>(async ({ scope }) => {
    const p = parseForm(productSchema, formToObject(fd));
    if (!p.ok) return p.result;
    // Pixel e link de upsell do produto (opcionais): validados ANTES de gravar, para não criar produtos a meio
    const str = (k: string) => {
      const v = fd.get(k);
      return typeof v === "string" ? v.trim().slice(0, 2000) : "";
    };
    const pixel = { pixelId: str("pixelId"), token: str("pixelToken") };
    const upsellUrl = str("upsellUrl");
    const extraErrors = { ...((await checkProductPixel(scope, pixel)) ?? {}), ...(upsellUrl && !validUpsellUrl(upsellUrl) ? { upsellUrl: "Introduza um endereço https:// completo" } : {}) };
    if (Object.keys(extraErrors).length) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: extraErrors };
    const extras = async (productId: string) => {
      if (!scope.isDemo) await setProductPixel(scope, productId, pixel);
      const warn = await setProductUpsellUrl(productId, upsellUrl, scope);
      revalidatePath("/funis");
      revalidatePath("/integracoes", "layout");
      return warn;
    };
    if (id) {
      try {
        const product = await updateProduct(assertId(id), p.data, scope);
        const warn = await extras(product.id);
        revalidatePath("/produtos");
        return warn ? { ok: false, error: `Produto atualizado. ${warn}` } : { ok: true, data: { id: product.id }, message: "Produto atualizado." };
      } catch (e) {
        if (!(e instanceof PublishBlockedError)) throw e;
        await extras(assertId(id));
        revalidatePath("/produtos");
        // os outros dados ficaram guardados; só a publicação foi recusada
        return { ok: false, error: `Alterações guardadas. ${blockedMessage(e)}` };
      }
    }
    const product = await createProduct(p.data, scope);
    const warn = await extras(product.id);
    revalidatePath("/produtos");
    return {
      ok: true,
      data: { id: product.id },
      message: `Produto criado como rascunho. O link do checkout foi gerado — publique o produto para começar a vender.${warn ? ` ${warn}` : ""}`,
    };
  });
}

const STATUS_MESSAGES: Record<ProductStatus, string> = {
  PUBLISHED: "Produto publicado.",
  UNPUBLISHED: "Produto passou a rascunho.",
  ARCHIVED: "Produto eliminado.",
  DRAFT: "Produto restaurado como rascunho.",
};

export async function setProductStatusAction(id: string, status: ProductStatus) {
  return guarded(async ({ scope }) => {
    if (!["PUBLISHED", "UNPUBLISHED", "ARCHIVED", "DRAFT"].includes(status)) return { ok: false, error: "Estado inválido." };
    try {
      await setProductStatus(assertId(id), status, scope);
    } catch (e) {
      if (e instanceof PublishBlockedError) return { ok: false, error: blockedMessage(e) };
      throw e;
    }
    revalidatePath("/produtos");
    revalidatePath("/funis");
    return { ok: true, message: STATUS_MESSAGES[status] };
  });
}

export async function duplicateProductAction(id: string) {
  return guarded<{ id: string }>(async ({ scope }) => {
    const p = await duplicateProduct(assertId(id), scope);
    revalidatePath("/produtos");
    return { ok: true, data: { id: p.id }, message: "Produto duplicado como rascunho." };
  });
}

/** Publicar (botão "Publicar produto"): mesma validação centralizada do servidor. */
export async function publishProductAction(id: string) {
  return guarded(async ({ scope }) => {
    try {
      await publishProduct(assertId(id), scope);
    } catch (e) {
      if (e instanceof PublishBlockedError) return { ok: false, error: blockedMessage(e) };
      throw e;
    }
    revalidatePath("/produtos");
    revalidatePath("/funis");
    return { ok: true, message: "Produto publicado. O checkout já pode receber compras." };
  });
}

/** Remove o ficheiro entregue do produto (secção "Entrega do produto"). */
export async function removeDeliveryFileAction(id: string) {
  return guarded(async ({ scope }) => {
    await removeProductDeliveryFile(assertId(id), scope);
    revalidatePath(`/produtos/${id}`);
    return { ok: true, message: "Ficheiro removido." };
  });
}
