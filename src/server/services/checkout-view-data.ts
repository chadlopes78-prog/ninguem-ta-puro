import type { Checkout, Offer, Product, Settings } from "@prisma/client";
import type { CheckoutViewData } from "@/components/checkouts/checkout-view";
import { prisma } from "@/server/db";

/**
 * Nome, descrição e imagem mostrados no checkout. O checkout principal de um produto segue SEMPRE o produto
 * (editar o produto atualiza o checkout); os checkouts criados à parte mantêm os seus textos e imagem.
 */
export function productFacing(c: Checkout & { product: Product }) {
  const primary = c.primaryProductId === c.product.id;
  return {
    title: primary ? c.product.name : c.title,
    description: primary ? c.product.description : c.description,
    imageUrl: primary ? (c.product.imageUrl ?? c.imageUrl) : (c.imageUrl ?? c.product.imageUrl),
  };
}

/** Dimensões reais (px) de uma imagem da biblioteca, para a mostrar sem cortes nem ampliação. */
export async function mediaSize(url: string | null | undefined): Promise<{ width: number; height: number } | null> {
  const id = url ? /^\/api\/public\/media\/([a-z0-9]{20,40})$/.exec(url)?.[1] : undefined;
  if (!id) return null;
  const m = await prisma.mediaAsset.findUnique({ where: { id }, select: { width: true, height: true } });
  return m?.width && m.height ? { width: m.width, height: m.height } : null;
}

/** Dados apresentados no checkout, sempre a partir da base de dados (preço e moeda nunca vêm do browser). */
export async function checkoutViewData(c: Checkout & { product: Product; offer: Offer }, settings: Settings): Promise<CheckoutViewData> {
  const facing = productFacing(c);
  const bannerUrl = c.product.bannerUrl;
  return {
    publicId: c.publicId,
    ...facing,
    bannerUrl,
    // tamanho da imagem do cartão do produto (o banner, ou a imagem principal)
    cardImageSize: await mediaSize(bannerUrl ?? facing.imageUrl),
    buttonText: c.buttonText,
    primaryColor: c.primaryColor,
    backgroundColor: c.backgroundColor,
    // sem email, o telefone é sempre pedido e obrigatório (identifica o comprador)
    collectEmail: c.product.collectEmail,
    showProductName: c.product.showName,
    collectPhone: c.collectPhone || !c.product.collectEmail,
    requirePhone: c.requirePhone || !c.product.collectEmail,
    collectDocument: c.collectDocument,
    requireDocument: c.requireDocument,
    allowCoupons: c.allowCoupons,
    supportEmail: c.supportEmail ?? c.product.supportEmail ?? settings.supportEmail,
    productName: c.product.name,
    offerName: c.offer.name,
    priceCents: c.offer.priceCents,
    compareAtCents: c.offer.compareAtCents,
    currency: c.offer.currency,
    isDemo: c.isDemo,
    businessName: settings.businessName,
  };
}
