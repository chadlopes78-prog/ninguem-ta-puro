import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getCheckout } from "@/server/services/checkouts";
import { NotFoundError } from "@/server/services/products";
import { CheckoutView } from "@/components/checkouts/checkout-view";
import { LinkButton } from "@/components/ui/button";

export default async function CheckoutPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { settings, scope } = await getScope();
  const c = await getCheckout(id, scope).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 lg:-my-8">
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2">
        <span className="text-sm text-muted">Pré-visualização de “{c.name}”</span>
        <LinkButton href={`/checkouts/${c.id}`} size="sm" variant="secondary">Voltar à edição</LinkButton>
      </div>
      <CheckoutView
        mode="preview"
        data={{
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
        }}
      />
    </div>
  );
}
