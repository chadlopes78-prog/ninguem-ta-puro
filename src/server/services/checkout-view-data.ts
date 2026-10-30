import type { Checkout, Offer, Product, Settings } from "@prisma/client";
import type { CheckoutViewData } from "@/components/checkouts/checkout-view";

/** Dados apresentados no checkout, sempre a partir da base de dados (preço e moeda nunca vêm do browser). */
export function checkoutViewData(c: Checkout & { product: Product; offer: Offer }, settings: Settings): CheckoutViewData {
  return {
    publicId: c.publicId,
    title: c.title,
    description: c.description,
    imageUrl: c.imageUrl ?? c.product.imageUrl,
    bannerUrl: c.product.bannerUrl,
    buttonText: c.buttonText,
    primaryColor: c.primaryColor,
    backgroundColor: c.backgroundColor,
    collectPhone: c.collectPhone,
    requirePhone: c.requirePhone,
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
