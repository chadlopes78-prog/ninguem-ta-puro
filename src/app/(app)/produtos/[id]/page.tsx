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
import { STAGE_LABELS } from "@/lib/product-setup";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";

export const metadata: Metadata = { title: "Editar produto" };

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  await requireUser();
  const { id } = await params;
  const { criado } = await searchParams;
  const { isDemo, settings, scope } = await getScope();
  const product = await getProduct(id, scope).catch((e) => {
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
              <ActionButton variant="secondary" action={setProductStatusAction.bind(null, product.id, "UNPUBLISHED")}>Despublicar</ActionButton>
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
      {!archived && (
        <Card className="mb-5" data-testid="product-requirements">
          <CardHeader
            title={readiness.ready ? "Configuração completa" : "Produto incompleto — configure o funil, a página de obrigado e a entrega do produto antes de publicar"}
            description={`Estado: ${STAGE_LABELS[readiness.stage]}. ${readiness.ready ? (product.status === "PUBLISHED" ? "O produto pode receber compras." : "Já pode publicar o produto.") : "Clique num requisito para o configurar."}`}
            action={
              !readiness.ready ? (
                <Link href={readiness.missing[0].href} className="inline-flex h-9 items-center rounded-[var(--radius-md)] bg-accent px-4 text-[13px] font-semibold text-accent-ink hover:bg-accent-strong" data-testid="complete-setup">
                  Completar configuração
                </Link>
              ) : undefined
            }
          />
          <CardBody>
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
        }}
      />
    </>
  );
}
