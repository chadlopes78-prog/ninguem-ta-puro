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
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE } from "@/components/products/labels";
import { duplicateProductAction, publishProductAction, removeDeliveryFileAction, saveProductAction, setProductStatusAction } from "../actions";
import { getReadiness } from "@/server/services/product-readiness";
import { productPixel } from "@/server/services/meta-capi";
import { productUpsellUrl } from "@/server/services/product-upsell";
import { STAGE_LABELS } from "@/lib/product-setup";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

export const metadata: Metadata = { title: "Editar produto" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string; publicado?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { criado, publicado } = await searchParams;
  const { isDemo, settings, scope } = await getScope();
  const product = await getProduct(id, scope).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const main = product.offers.find((o) => o.isDefault) ?? product.offers[0];
  // Garante (e recupera, se necessário) o checkout principal com o seu link
  const primary = await ensurePrimaryCheckout(product.id);
  const [pixel, upsellUrl] = await Promise.all([productPixel(scope, product.id), productUpsellUrl(product.id, scope)]);
  const design = await prisma.checkoutDesign.findUnique({ where: { checkoutId: primary.id }, select: { draft: true, published: true } });
  const path = checkoutPath(primary);
  const base = await resolveAppBaseUrl();
  const live = product.status === "PUBLISHED" && primary.isActive && Boolean(main?.isActive);
  const archived = product.status === "ARCHIVED";
  const readiness = await getReadiness(product.id, scope);

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
              <ActionButton variant="secondary" action={setProductStatusAction.bind(null, product.id, "UNPUBLISHED")}>Passar a rascunho</ActionButton>
            )}
            {(product.status === "DRAFT" || product.status === "UNPUBLISHED") && (
              <ActionButton action={publishProductAction.bind(null, product.id)} data-testid="publish-product">
                Publicar
              </ActionButton>
            )}
            {archived ? (
              <ActionButton action={setProductStatusAction.bind(null, product.id, "DRAFT")}>Restaurar</ActionButton>
            ) : (
              <ActionButton
                variant="danger"
                action={setProductStatusAction.bind(null, product.id, "ARCHIVED")}
                redirectTo="/produtos"
                successMessage="Produto eliminado."
                confirm={{ title: "Eliminar produto", description: "O produto sai da lista e o link do checkout deixa de funcionar. As vendas já feitas continuam nos pedidos e relatórios.", confirmLabel: "Eliminar", danger: true }}
              >
                Eliminar
              </ActionButton>
            )}
          </>
        }
      />
      {publicado === "1" && live && (
        <div className="mb-5" data-testid="product-published">
          <Alert tone="success" title="Produto publicado com sucesso!">
            O checkout já está disponível. Partilhe o link abaixo para começar a vender.
          </Alert>
        </div>
      )}
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
              ? "O produto foi eliminado: o checkout não aceita compras."
              : product.status !== "PUBLISHED"
                ? "O produto não está publicado: quem abrir o link vê uma página de indisponibilidade. Publique o produto para começar a vender."
                : !primary.isActive
                  ? "O checkout está desativado."
                  : undefined
          }
        />
      </div>
      {!archived && (
        <Card className="mb-5" data-testid="product-requirements">
          <CardHeader
            title={readiness.ready ? (product.status === "PUBLISHED" ? "Pronto para vender" : "Pronto para publicar") : "Para publicar falta a entrega do produto"}
            description={`Estado: ${STAGE_LABELS[readiness.stage]}. ${readiness.ready ? (product.status === "PUBLISHED" ? "O checkout aceita compras e o comprador recebe o produto logo após o pagamento confirmado." : "Publique o produto para começar a vender pelo checkout.") : "Escolha o que o comprador recebe depois de pagar (ficheiro ou link)."}`}
          />
          <CardBody className="flex flex-col gap-3">
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {readiness.requirements.map((r) => (
                <li key={r.key}>
                  <Link href={r.href} className="flex items-start gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] hover:bg-surface-2" data-testid={`req-${r.key}`} data-ok={r.ok}>
                    {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
                    <span>
                      <span className="font-medium">{r.label}:</span> <span className={r.ok ? "text-success" : "text-warning"}>{r.ok ? "concluído" : "pendente"}</span>
                      {!r.ok && <span className="block text-[12px] text-muted">{r.detail}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="border-t border-line pt-3 text-[12.5px] text-muted" data-testid="product-funnel-optional">
              Funil (opcional):{" "}
              {readiness.mainFunnelId ? (
                <Link href={`/funis/${readiness.mainFunnelId}`} className="font-medium text-accent hover:underline">
                  editar upsells, downsells e página de obrigado
                </Link>
              ) : (
                <>
                  sem funil, o comprador vai direto para a página de acesso ao produto.{" "}
                  <Link href={`/funis?criar=${product.id}`} className="font-medium text-accent hover:underline">
                    Adicionar upsells/downsells
                  </Link>
                </>
              )}
            </p>
          </CardBody>
        </Card>
      )}
      {archived && (
        <Alert tone="warning" className="mb-5" title="Produto arquivado">
          Restaure o produto para o editar.
        </Alert>
      )}
      <ProductForm
        isNew={false}
        readOnly={archived}
        action={saveProductAction.bind(null, product.id)}
        productId={product.id}
        removeDeliveryFileAction={removeDeliveryFileAction.bind(null, product.id)}
        funnelHref={readiness.mainFunnelId ? `/funis/${readiness.mainFunnelId}` : undefined}
        initial={{
          name: product.name,
          description: product.description,
          imageUrl: product.imageUrl ?? "",
          type: product.type,
          category: product.category ?? "",
          priceCents: main?.priceCents ?? null,
          currency: main?.currency ?? settings.defaultCurrency,
          status: product.status,
          delivery: { method: product.deliveryMethod ?? "", url: product.deliveryUrl ?? "", file: product.deliveryFile },
          pixel,
          upsellUrl,
          bannerUrl: product.bannerUrl ?? "",
          collectEmail: product.collectEmail,
          showName: product.showName,
        }}
      />
    </>
  );
}
