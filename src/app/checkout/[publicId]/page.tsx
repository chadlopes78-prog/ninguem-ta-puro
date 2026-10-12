import type { Metadata } from "next";
import { getPublicCheckout } from "@/server/services/checkouts";
import { getSettings } from "@/server/services/settings";
import { getActivePaymentProvider } from "@/server/payments/registry";
import { publicDesign } from "@/server/services/checkout-design";
import { CheckoutView } from "@/components/checkouts/checkout-view";
import { Unavailable } from "@/components/public/unavailable";
import { applyCouponAction, submitCheckoutAction } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ publicId: string }> }): Promise<Metadata> {
  const r = await getPublicCheckout((await params).publicId);
  return { title: r.state === "ok" ? r.checkout.title : "Indisponível", robots: { index: false } };
}

export default async function PublicCheckoutPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const r = await getPublicCheckout(publicId);
  if (r.state !== "ok") return <Unavailable />;
  const c = r.checkout;
  const settings = await getSettings();
  const provider = c.isDemo ? null : getActivePaymentProvider();
  const providerOk = Boolean(provider && provider.supportedCurrencies.includes(c.offer.currency));
  const paymentMethods = providerOk && provider!.checkoutMode === "direct" ? provider!.methods() : [];
  const hostedPayment =
    providerOk && provider!.checkoutMode === "hosted"
      ? { provider: provider!.displayName, methodsLabel: provider!.hostedMethodsLabel ?? "carteira móvel", isTest: provider!.environment() === "test" }
      : null;
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
        paymentMethods,
        hostedPayment,
      }}
      submitAction={submitCheckoutAction.bind(null, c.publicId)}
      couponAction={applyCouponAction.bind(null, c.publicId)}
    />
  );
}
