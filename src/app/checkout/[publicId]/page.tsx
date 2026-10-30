import type { Metadata } from "next";
import { cache } from "react";
import { getPublicCheckout } from "@/server/services/checkouts";
import { getSettings } from "@/server/services/settings";
import { getActivePaymentProviders } from "@/server/payments/registry";
import { listPaymentOptions } from "@/server/services/payment-flow";
import { publicDesign, realSocialProof, usesRealSocialProof } from "@/server/services/checkout-design";
import { checkoutViewData, productFacing } from "@/server/services/checkout-view-data";
import { hasUsableCoupons } from "@/server/services/coupons";
import { scopeOf } from "@/server/scope";
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
  return { title: r.state === "ok" ? (r.checkout.product.showName ? productFacing(r.checkout).title : "Checkout seguro") : "Indisponível", robots: { index: false } };
}

export default async function PublicCheckoutPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const r = await loadCheckout(publicId);
  if (r.state !== "ok") return <Unavailable />;
  const c = r.checkout;
  // Nome do negócio e gateways da conta dona deste checkout (consultas independentes, em paralelo).
  // Apenas gateways ativos e configurados que aceitem a moeda do produto.
  const [settings, active, couponsAvailable] = await Promise.all([
    getSettings(c.ownerId),
    c.isDemo ? Promise.resolve([]) : getActivePaymentProviders(c.ownerId),
    // o campo de cupão só aparece se a conta tiver cupões utilizáveis
    c.allowCoupons ? hasUsableCoupons(scopeOf(c.ownerId, c.isDemo)) : Promise.resolve(false),
  ]);
  const providers = active.filter((p) => p.supportedCurrencies.includes(c.offer.currency));
  const paymentOptions = listPaymentOptions(providers);
  const design = publicDesign(c);
  // prova social com dados reais (só quando o design a mostra)
  const [socialProof, viewData] = await Promise.all([
    usesRealSocialProof(design) && !c.isDemo ? realSocialProof(c.id) : Promise.resolve(undefined),
    checkoutViewData(c, settings),
  ]);
  return (
    <CheckoutView
      design={design}
      data={{
        ...viewData,
        // o campo de cupão só aparece se a conta tiver cupões utilizáveis
        allowCoupons: couponsAvailable,
        paymentOptions,
        socialProof,
      }}
      submitAction={submitCheckoutAction.bind(null, c.publicId)}
      couponAction={applyCouponAction.bind(null, c.publicId)}
    />
  );
}
