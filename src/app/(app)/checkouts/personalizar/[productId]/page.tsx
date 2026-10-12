import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getEditorState } from "@/server/services/checkout-design";
import { checkoutPath } from "@/server/services/primary-checkout";
import { checkoutViewData } from "@/server/services/checkout-view-data";
import { NotFoundError } from "@/server/services/products";
import { prisma } from "@/server/db";
import { DesignEditor } from "@/components/checkouts/design-editor";
import { discardDraftAction, publishDesignAction, saveDesignDraftAction } from "../actions";

export const metadata: Metadata = { title: "Personalizar checkout" };

export default async function PersonalizeCheckoutPage({ params }: { params: Promise<{ productId: string }> }) {
  await requireUser();
  const { productId } = await params;
  const { isDemo, settings } = await getScope();
  const state = await getEditorState(productId, isDemo).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const full = await prisma.checkout.findUniqueOrThrow({ where: { id: state.checkout.id }, include: { product: true, offer: true } });
  return (
    <DesignEditor
      key={`${state.checkout.id}:${state.version}:${state.draftUpdatedAt?.toISOString() ?? ""}`}
      productId={state.product.id}
      productName={state.product.name}
      checkoutPath={checkoutPath(state.checkout)}
      initial={state.draft}
      status={state.status}
      hasPublished={state.hasPublished}
      previewData={checkoutViewData(full, settings)}
      saveAction={saveDesignDraftAction.bind(null, state.product.id)}
      publishAction={publishDesignAction.bind(null, state.product.id)}
      discardAction={discardDraftAction.bind(null, state.product.id)}
    />
  );
}
