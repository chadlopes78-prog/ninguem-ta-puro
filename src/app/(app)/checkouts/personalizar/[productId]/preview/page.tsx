import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getEditorState, publicDesign } from "@/server/services/checkout-design";
import { checkoutViewData } from "@/server/services/checkout-view-data";
import { NotFoundError } from "@/server/services/products";
import { prisma } from "@/server/db";
import { CheckoutView } from "@/components/checkouts/checkout-view";
import { LinkButton } from "@/components/ui/button";

/** Pré-visualização privada: rascunho guardado (por omissão) ou versão publicada (?versao=publicada). */
export default async function DesignPreviewPage({ params, searchParams }: { params: Promise<{ productId: string }>; searchParams: Promise<{ versao?: string }> }) {
  await requireUser();
  const { productId } = await params;
  const { versao } = await searchParams;
  const { settings, scope } = await getScope();
  const state = await getEditorState(productId, scope).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const full = await prisma.checkout.findUniqueOrThrow({ where: { id: state.checkout.id }, include: { product: true, offer: true, design: { select: { published: true } } } });
  const showPublished = versao === "publicada";
  return (
    <div className="-mx-4 -my-6 sm:-mx-6 lg:-mx-8 lg:-my-8">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface px-4 py-2">
        <span className="text-sm text-muted">
          {showPublished ? "Versão publicada" : "Rascunho guardado"} de “{state.product.name}”
        </span>
        <div className="flex gap-2">
          <LinkButton href={`/checkouts/personalizar/${state.product.id}/preview${showPublished ? "" : "?versao=publicada"}`} size="sm" variant="ghost">
            Ver {showPublished ? "rascunho" : "versão publicada"}
          </LinkButton>
          <LinkButton href={`/checkouts/personalizar/${state.product.id}`} size="sm" variant="secondary">
            Voltar ao editor
          </LinkButton>
        </div>
      </div>
      <CheckoutView mode="preview" data={checkoutViewData(full, settings)} design={showPublished ? publicDesign(full) : state.draft} />
    </div>
  );
}
