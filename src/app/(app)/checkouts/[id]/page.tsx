import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, Eye } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getCheckout } from "@/server/services/checkouts";
import { checkoutPath } from "@/server/services/primary-checkout";
import { listProductOptions, NotFoundError } from "@/server/services/products";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/ui/page-header";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { ActionButton } from "@/components/ui/action-button";
import { Alert } from "@/components/ui/alert";
import { CheckoutForm } from "@/components/checkouts/checkout-form";
import { saveCheckoutAction, setCheckoutActiveAction, duplicateCheckoutAction } from "../actions";

export const metadata: Metadata = { title: "Editar checkout" };

export default async function CheckoutPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { isDemo, settings } = await getScope();
  const c = await getCheckout(id, isDemo).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const [products, funnels] = await Promise.all([
    listProductOptions(isDemo),
    prisma.funnel.findMany({ where: { isDemo }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const path = checkoutPath(c);
  const publicOk = c.isActive && c.product.status === "PUBLISHED" && c.offer.isActive;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Todos os checkouts", href: "/checkouts/avancado" }, { label: c.name }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {c.name}
            {c.isActive ? <Badge tone="success" dot>Ativo</Badge> : <Badge>Inativo</Badge>}
            {isDemo && <DemoBadge />}
          </span>
        }
        actions={
          <>
            <ActionButton variant="secondary" action={duplicateCheckoutAction.bind(null, c.id)}>Duplicar</ActionButton>
            <ActionButton variant={c.isActive ? "secondary" : "primary"} action={setCheckoutActiveAction.bind(null, c.id, !c.isActive)}>
              {c.isActive ? "Desativar" : "Ativar"}
            </ActionButton>
          </>
        }
      />
      <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium uppercase tracking-wider text-subtle">Link público</p>
          <p className="mt-1 truncate font-mono text-sm text-fg" data-testid="checkout-path">{path}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={path} />
          <LinkButton href={`/checkouts/${c.id}/preview`} variant="secondary" size="sm"><Eye className="h-4 w-4" /> Pré-visualizar</LinkButton>
          <a href={path} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface-3 px-3 text-[13px] font-medium text-fg hover:bg-surface-hover">
            <ExternalLink className="h-4 w-4" /> Abrir
          </a>
        </div>
      </Card>
      {!publicOk && (
        <Alert tone="warning" className="mb-5" title="O link público está indisponível">
          {!c.isActive ? "O checkout está desativado." : c.product.status !== "PUBLISHED" ? "O produto não está publicado." : "A oferta está inativa."}
        </Alert>
      )}
      <CheckoutForm
        isNew={false}
        isDemo={isDemo}
        businessName={settings.businessName}
        products={products}
        funnels={funnels}
        action={saveCheckoutAction.bind(null, c.id)}
        initial={{
          name: c.name,
          productId: c.productId,
          offerId: c.offerId,
          title: c.title,
          description: c.description ?? "",
          imageUrl: c.imageUrl ?? "",
          buttonText: c.buttonText,
          primaryColor: c.primaryColor,
          backgroundColor: c.backgroundColor,
          collectPhone: c.collectPhone,
          requirePhone: c.requirePhone,
          collectDocument: c.collectDocument,
          requireDocument: c.requireDocument,
          allowCoupons: c.allowCoupons,
          successTitle: c.successTitle,
          successMessage: c.successMessage,
          successRedirectUrl: c.successRedirectUrl ?? "",
          supportEmail: c.supportEmail ?? "",
          funnelId: c.funnelId ?? "",
          isActive: c.isActive,
        }}
      />
    </>
  );
}
