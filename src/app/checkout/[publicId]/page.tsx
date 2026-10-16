import type { Metadata } from "next";
import { cache } from "react";
import { getPublicCheckout } from "@/server/services/checkouts";
import { getSettings } from "@/server/services/settings";
import { getActivePaymentProviders } from "@/server/payments/registry";
import { listPaymentOptions } from "@/server/services/payment-flow";
import { publicDesign } from "@/server/services/checkout-design";
import { CheckoutView } from "@/components/checkouts/checkout-view";
import { Unavailable } from "@/components/public/unavailable";
import { applyCouponAction, submitCheckoutAction } from "./actions";

export const dynamic = "force-dynamic";
// A E2Payments só responde depois de o comprador confirmar no telemóvel (o SDK oficial espera até 180 s).
export const maxDuration = 180;

// Uma única leitura por pedido (os metadados e a página partilham o resultado)
const loadCheckout = cache(getPublicCheckout);

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const r = await loadCheckout((await params).publicId);
  return { title: r.state === "ok" ? r.checkout.title : "Indisponível", robots: { index: false } };
}

export default async function PublicCheckoutPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const r = await loadCheckout(publicId);
  if (r.state !== "ok") return <Unavailable />;
  const c = r.checkout;
  // Nome do negócio e gateways da conta dona deste checkout (consultas independentes, em paralelo).
  // Apenas gateways ativos e configurados que aceitem a moeda do produto.
  const [settings, active] = await Promise.all([getSettings(c.ownerId), c.isDemo ? Promise.resolve([]) : getActivePaymentProviders(c.ownerId)]);
  const providers = active.filter((p) => p.supportedCurrencies.includes(c.offer.currency));
  const paymentOptions = listPaymentOptions(providers);
  return (
    <CheckoutView
      design={publicDesign(c)}
      data={{
        publicId: c.publicId,
        title: c.title,
        description: c.description,
        imageUrl: c.imageUrl ?? c.product.imageUrl,
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
        paymentOptions,
      }}
      submitAction={submitCheckoutAction.bind(null, c.publicId)}
      couponAction={applyCouponAction.bind(null, c.publicId)}
    />
  );
}
