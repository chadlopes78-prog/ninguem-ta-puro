import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getThankYouEditorState } from "@/server/services/thank-you-custom";
import { NotFoundError } from "@/server/services/products";
import { prisma } from "@/server/db";
import { ThankYouEditor } from "@/components/checkout-editor/thank-you-editor";
import { publishThankYouAction, resetThankYouAction, saveThankYouDraftAction } from "../../actions";

export const metadata: Metadata = { title: "Personalizar página de obrigado" };

export default async function PersonalizeThankYouPage({ params }: { params: Promise<{ productId: string }> }) {
  await requireUser();
  const { productId } = await params;
  const { settings, scope } = await getScope();
  const state = await getThankYouEditorState(productId, scope).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const offer = state.product.offers[0];
  const checkout = await prisma.checkout.findUnique({ where: { id: state.checkout.id }, select: { funnelId: true } });
  return (
    <ThankYouEditor
      key={`${state.status}:${state.version}`}
      productId={state.product.id}
      productName={state.product.name}
      productImage={state.product.imageUrl}
      priceCents={offer?.priceCents ?? 0}
      currency={offer?.currency ?? "MZN"}
      deliveryKind={state.product.deliveryMethod}
      businessName={settings.businessName}
      hasFunnel={Boolean(checkout?.funnelId)}
      initial={state.draft}
      status={state.status}
      saveAction={saveThankYouDraftAction.bind(null, state.product.id)}
      publishAction={publishThankYouAction.bind(null, state.product.id)}
      resetAction={resetThankYouAction.bind(null, state.product.id)}
    />
  );
}
