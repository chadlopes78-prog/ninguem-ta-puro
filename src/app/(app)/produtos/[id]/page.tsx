import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getProduct, NotFoundError } from "@/server/services/products";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { CheckoutLinkCard } from "@/components/products/checkout-link-card";
import { checkoutPath, ensurePrimaryCheckout } from "@/server/services/primary-checkout";
import { designStatus, DESIGN_STATUS_LABELS } from "@/server/services/checkout-design";
import { resolveAppBaseUrl } from "@/server/app-url";
import { prisma } from "@/server/db";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionButton } from "@/components/ui/action-button";
import { ProductForm } from "@/components/products/product-form";
import { OffersCard } from "@/components/products/offers-card";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE } from "@/components/products/labels";
import { addOfferAction, duplicateProductAction, saveProductAction, setOfferActiveAction, setProductStatusAction } from "../actions";

export const metadata: Metadata = { title: "Editar produto" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { criado } = await searchParams;
  const { isDemo, settings } = await getScope();
  const product = await getProduct(id, isDemo).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const main = product.offers.find((o) => o.isDefault) ?? product.offers[0];
  // Garante (e recupera, se necessário) o checkout principal com o seu link
  const primary = await ensurePrimaryCheckout(product.id);
  const design = await prisma.checkoutDesign.findUnique({ where: { checkoutId: primary.id }, select: { draft: true, published: true } });
  const path = checkoutPath(primary);
  const base = await resolveAppBaseUrl();
  const live = product.status === "PUBLISHED" && primary.isActive && Boolean(main?.isActive);
  const archived = product.status === "ARCHIVED";

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Produtos", href: "/produtos" }, { label: product.name }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {product.name}
            <Badge tone={PRODUCT_STATUS_TONE[product.status]} dot>
              {PRODUCT_STATUS_LABELS[product.status]}
            </Badge>
            {isDemo && <DemoBadge />}
          </span>
        }
        description={`Criado em ${formatDate(product.createdAt, settings.timezone)} · ${product._count.orderItems} ${product._count.orderItems === 1 ? "item vendido" : "itens vendidos"} · ${product._count.checkouts} ${product._count.checkouts === 1 ? "checkout" : "checkouts"}`}
        actions={
          <>

            <ActionButton variant="secondary" action={duplicateProductAction.bind(null, product.id)} successMessage="Produto duplicado.">
              Duplicar
            </ActionButton>
            {product.status === "PUBLISHED" && (
              <ActionButton variant="secondary" action={setProductStatusAction.bind(null, product.id, "UNPUBLISHED")}>Despublicar</ActionButton>
            )}
            {(product.status === "DRAFT" || product.status === "UNPUBLISHED") && (
              <ActionButton action={setProductStatusAction.bind(null, product.id, "PUBLISHED")}>Publicar</ActionButton>
            )}
            {archived ? (
              <ActionButton action={setProductStatusAction.bind(null, product.id, "DRAFT")}>Restaurar</ActionButton>
            ) : (
              <ActionButton
                variant="danger"
                action={setProductStatusAction.bind(null, product.id, "ARCHIVED")}
                confirm={{ title: "Arquivar produto", description: "Os checkouts deste produto deixam de estar disponíveis publicamente. Pode restaurá-lo mais tarde.", confirmLabel: "Arquivar", danger: true }}
              >
                Arquivar
              </ActionButton>
            )}
          </>
        }
      />
      <div className="mb-5">
        <CheckoutLinkCard
          productId={product.id}
          url={`${base}${path}`}
          path={path}
          live={live}
          justCreated={criado === "1"}
          designLabel={DESIGN_STATUS_LABELS[designStatus(design)]}
          reason={
            archived
              ? "O produto está arquivado: o checkout não aceita compras."
              : product.status !== "PUBLISHED"
                ? "O produto não está publicado: quem abrir o link vê uma página de indisponibilidade. Publique o produto para começar a vender."
                : !primary.isActive
                  ? "O checkout está desativado."
                  : undefined
          }
        />
      </div>
      {archived && (
        <Alert tone="warning" className="mb-5" title="Produto arquivado">
          Restaure o produto para o editar.
        </Alert>
      )}
      <ProductForm
        isNew={false}
        readOnly={archived}
        action={saveProductAction.bind(null, product.id)}
        initial={{
          name: product.name,
          description: product.description,
          imageUrl: product.imageUrl ?? "",
          type: product.type,
          category: product.category ?? "",
          priceCents: main?.priceCents ?? null,
          compareAtCents: main?.compareAtCents ?? null,
          currency: main?.currency ?? settings.defaultCurrency,
          status: product.status,
          salesPageUrl: product.salesPageUrl ?? "",
          supportEmail: product.supportEmail ?? "",
          deliveryUrl: product.deliveryUrl ?? "",
        }}
      />
      <div className="mt-5 lg:w-2/3 lg:pr-[10px]">
        <OffersCard
          offers={product.offers}
          disabled={archived}
          defaultCurrency={main?.currency ?? settings.defaultCurrency}
          addAction={addOfferAction.bind(null, product.id)}
          toggleAction={setOfferActiveAction}
        />
      </div>
    </>
  );
}
