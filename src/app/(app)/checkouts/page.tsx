import type { Metadata } from "next";
import Link from "next/link";
import { Eye, Paintbrush, Plus, Wand2 } from "lucide-react";
import type { ProductStatus } from "@prisma/client";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { designStatus, DESIGN_STATUS_LABELS, listCheckoutPersonalization } from "@/server/services/checkout-design";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge, DemoBadge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/filters/list-filters";
import { ProductCover } from "@/components/products/cover";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE } from "@/components/products/labels";

export const metadata: Metadata = { title: "Personalizar Checkout" };

const DESIGN_TONE = { default: "neutral", published: "success", unpublished_changes: "warning" } as const satisfies Record<string, Tone>;

function sellable(status: ProductStatus, isActive: boolean) {
  return status === "PUBLISHED" && isActive;
}

export default async function CheckoutPersonalizationPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, scope } = await getScope();
  const products = await listCheckoutPersonalization(scope, sp.q?.slice(0, 100));

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Personalizar Checkout {isDemo && <DemoBadge />}</span>}
        description="Escolha o produto e personalize a experiência de compra. O link de cada checkout está na página do produto."
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
            const ds = designStatus(c.design ? { draft: c.design.draft, published: c.design.published } : null);
            const live = sellable(p.status, c.isActive);
            return (
              <li key={p.id} data-testid="personalization-card">
                <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-line-strong">
                  <div className="flex items-start gap-3 p-4 pb-3">
                    <ProductCover src={p.imageUrl} name={p.name} className="h-14 w-14 text-base" />
                    <div className="min-w-0 flex-1">
                      <Link href={`/checkouts/personalizar/${p.id}`} className="block truncate font-display text-[15px] font-semibold hover:text-accent">
                        {p.name}
                      </Link>
                      <p className="mt-0.5 font-medium tabular text-fg">{offer ? formatMoney(offer.priceCents, offer.currency) : "—"}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone={PRODUCT_STATUS_TONE[p.status]} dot>
                          {PRODUCT_STATUS_LABELS[p.status]}
                        </Badge>
                        <Badge tone={DESIGN_TONE[ds]}>{DESIGN_STATUS_LABELS[ds]}</Badge>
                      </div>
                      {!live && <p className="mt-2 text-[11.5px] text-warning">{p.status !== "PUBLISHED" ? "Produto não publicado: ainda não aceita compras." : "Checkout desativado."}</p>}
                    </div>
                  </div>
                  <div className="mt-auto flex items-center gap-2 p-4">
                    <LinkButton href={`/checkouts/personalizar/${p.id}`} size="sm" className="min-w-0 flex-1" data-testid="personalize" aria-label={`Personalizar Checkout de ${p.name}`}>
                      <Paintbrush className="h-4 w-4 shrink-0" /> <span className="truncate">Personalizar Checkout</span>
                    </LinkButton>
                    <Link href={`/checkouts/personalizar/${p.id}/preview`} className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-line bg-surface-3 text-muted hover:bg-surface-hover hover:text-fg" aria-label={`Pré-visualizar checkout de ${p.name}`}>
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
