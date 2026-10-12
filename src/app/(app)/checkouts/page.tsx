import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Eye, Paintbrush, Plus, Settings2, Wand2 } from "lucide-react";
import type { ProductStatus } from "@prisma/client";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { designStatus, DESIGN_STATUS_LABELS, listCheckoutPersonalization } from "@/server/services/checkout-design";
import { checkoutPath } from "@/server/services/primary-checkout";
import { resolveAppBaseUrl } from "@/server/app-url";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge, DemoBadge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CopyButton } from "@/components/ui/copy-button";
import { ListFilters } from "@/components/filters/list-filters";
import { ProductCover } from "@/components/products/cover";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE } from "@/components/products/labels";

export const metadata: Metadata = { title: "Personalização do Checkout" };

const DESIGN_TONE = { default: "neutral", published: "success", unpublished_changes: "warning" } as const satisfies Record<string, Tone>;

function sellable(status: ProductStatus, isActive: boolean) {
  return status === "PUBLISHED" && isActive;
}

export default async function CheckoutPersonalizationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo } = await getScope();
  const [products, base] = await Promise.all([listCheckoutPersonalization(isDemo, sp.q?.slice(0, 100)), resolveAppBaseUrl()]);

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Personalização do Checkout {isDemo && <DemoBadge />}</span>}
        description="Personalize a experiência de compra dos seus produtos. Cada produto já tem o seu checkout e link, criados automaticamente."
        actions={
          <>
            <LinkButton href="/checkouts/avancado" variant="ghost">
              <Settings2 className="h-4 w-4" /> Todos os checkouts
            </LinkButton>
            <LinkButton href="/produtos/novo">
              <Plus className="h-4 w-4" /> Novo produto
            </LinkButton>
          </>
        }
      />

      {products.length > 0 || sp.q ? (
        <div className="mb-4">
          <ListFilters placeholder="Pesquisar produtos…" />
        </div>
      ) : null}

      {products.length === 0 ? (
        <Card>
          <EmptyState
            icon={Wand2}
            title={sp.q ? "Nenhum produto encontrado" : "Ainda não tem produtos"}
            description={sp.q ? "Ajuste a pesquisa." : "Crie o seu primeiro produto para gerar automaticamente o respetivo link de checkout."}
            action={
              !sp.q ? (
                <LinkButton href="/produtos/novo">
                  <Plus className="h-4 w-4" /> Criar primeiro produto
                </LinkButton>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="personalization-list">
          {products.map((p) => {
            const c = p.checkouts[0];
            const offer = p.offers[0];
            if (!c) return null;
            const path = checkoutPath(c);
            const ds = designStatus(c.design ? { draft: c.design.draft, published: c.design.published } : null);
            const live = sellable(p.status, c.isActive);
            return (
              <li key={p.id} data-testid="personalization-card">
                <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-line-strong">
                  <div className="flex items-start gap-3 p-4 pb-3">
                    <ProductCover src={p.imageUrl} name={p.name} className="h-14 w-14 text-base" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/produtos/${p.id}`} className="block truncate font-display text-[15px] font-semibold hover:text-accent">
                        {p.name}
                      </Link>
                      <p className="mt-0.5 font-medium tabular text-fg">{offer ? formatMoney(offer.priceCents, offer.currency) : "—"}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone={PRODUCT_STATUS_TONE[p.status]} dot>
                          {PRODUCT_STATUS_LABELS[p.status]}
                        </Badge>
                        <Badge tone={DESIGN_TONE[ds]}>{DESIGN_STATUS_LABELS[ds]}</Badge>
                      </div>
                    </div>
                  </div>
                  <div className="mx-4 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-subtle">Link do checkout</p>
                    <p className="mt-0.5 break-all font-mono text-[12px] text-fg" data-testid="card-checkout-url">
                      {base}
                      {path}
                    </p>
                    {!live && (
                      <p className="mt-1 text-[11.5px] text-warning">
                        {p.status !== "PUBLISHED" ? "Produto não publicado: o link mostra “indisponível” até o publicar." : "Checkout desativado."}
                      </p>
                    )}
                  </div>
                  <div className="mt-auto flex items-center gap-2 p-4">
                    <LinkButton href={`/checkouts/personalizar/${p.id}`} size="sm" className="min-w-0 flex-1" data-testid="personalize" aria-label={`Personalizar Checkout de ${p.name}`}>
                      <Paintbrush className="h-4 w-4 shrink-0" /> <span className="truncate">Personalizar<span className="hidden min-[420px]:inline"> Checkout</span></span>
                    </LinkButton>
                    <CopyButton value={path} size="icon" label={`Copiar link de ${p.name}`} />
                    <a href={path} target="_blank" rel="noopener" className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-line bg-surface-3 text-muted hover:bg-[#252a31] hover:text-fg" aria-label={`Abrir checkout de ${p.name}`}>
                      <ExternalLink className="h-4 w-4" />
                    </a>
                    <Link href={`/checkouts/personalizar/${p.id}/preview`} className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-line bg-surface-3 text-muted hover:bg-[#252a31] hover:text-fg" aria-label={`Pré-visualizar checkout de ${p.name}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
