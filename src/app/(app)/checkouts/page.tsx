import type { Metadata } from "next";
import Link from "next/link";
import { Eye, PartyPopper, Paintbrush, Plus, Wand2 } from "lucide-react";
import type { ProductStatus } from "@prisma/client";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { designStatus, DESIGN_STATUS_LABELS, listCheckoutPersonalization } from "@/server/services/checkout-design";
import { THANK_YOU_STATUS_LABELS, thankYouStatus } from "@/server/services/thank-you-custom";
import { cn } from "@/lib/utils";
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
  const tab: "checkout" | "obrigado" = sp.tab === "obrigado" ? "obrigado" : "checkout";

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Personalizar Checkout {isDemo && <DemoBadge />}</span>}
        description="Escolha o produto e personalize o checkout ou a página de obrigado mostrada depois do pagamento confirmado."
      />

      <nav aria-label="O que personalizar" className="mb-5 inline-flex w-full flex-wrap gap-1 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-1 sm:w-auto" data-testid="personalization-tabs">
        {(
          [
            { key: "checkout", href: "/checkouts", label: "Personalizar checkout", icon: Paintbrush },
            { key: "obrigado", href: "/checkouts?tab=obrigado", label: "Personalizar página de obrigado", icon: PartyPopper },
          ] as const
        ).map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn("inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 text-[13.5px] font-medium sm:flex-none", tab === t.key ? "bg-surface-3 text-fg shadow-sm" : "text-muted hover:text-fg")}
            data-testid={`tab-${t.key}`}
          >
            <t.icon className="h-4 w-4" aria-hidden="true" /> {t.label}
          </Link>
        ))}
      </nav>

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
            const ts = thankYouStatus(c.thankYou ? { draft: c.thankYou.draft, published: c.thankYou.published } : null);
            const live = sellable(p.status, c.isActive);
            return (
              <li key={p.id} data-testid="personalization-card">
                <Card className="flex h-full flex-col overflow-hidden transition-colors hover:border-line-strong">
                  <div className="flex items-start gap-3 p-4 pb-3">
                    <ProductCover src={p.imageUrl} name={p.name} className="h-14 w-14 text-base" />
                    <div className="min-w-0 flex-1">
                      <Link href={tab === "obrigado" ? `/checkouts/personalizar/${p.id}/obrigado` : `/checkouts/personalizar/${p.id}`} className="-my-1 block truncate py-1 font-display text-[15px] font-semibold hover:text-accent">
                        {p.name}
                      </Link>
                      <p className="mt-0.5 font-medium tabular text-fg">{offer ? formatMoney(offer.priceCents, offer.currency) : "—"}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone={PRODUCT_STATUS_TONE[p.status]} dot>
                          {PRODUCT_STATUS_LABELS[p.status]}
                        </Badge>
                        {tab === "checkout" ? <Badge tone={DESIGN_TONE[ds]}>{DESIGN_STATUS_LABELS[ds]}</Badge> : <Badge tone={DESIGN_TONE[ts]}>{THANK_YOU_STATUS_LABELS[ts]}</Badge>}
                      </div>
                      {!live && <p className="mt-2 text-[11.5px] text-warning">{p.status !== "PUBLISHED" ? "Produto não publicado: ainda não aceita compras." : "Checkout desativado."}</p>}
                    </div>
                  </div>
                  {tab === "obrigado" ? (
                    <div className="mt-auto flex items-center gap-2 p-4">
                      <LinkButton href={`/checkouts/personalizar/${p.id}/obrigado`} size="sm" className="min-w-0 flex-1" data-testid="personalize-thank-you" aria-label={`Personalizar página de obrigado de ${p.name}`}>
                        <PartyPopper className="h-4 w-4 shrink-0" /> <span className="truncate">Personalizar página de obrigado</span>
                      </LinkButton>
                    </div>
                  ) : (
                  <div className="mt-auto flex items-center gap-2 p-4">
                    <LinkButton href={`/checkouts/personalizar/${p.id}`} size="sm" className="min-w-0 flex-1" data-testid="personalize" aria-label={`Personalizar Checkout de ${p.name}`}>
                      <Paintbrush className="h-4 w-4 shrink-0" /> <span className="truncate">Personalizar Checkout</span>
                    </LinkButton>
                    <Link href={`/checkouts/personalizar/${p.id}/preview`} className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] border border-line bg-surface-3 text-muted hover:bg-surface-hover hover:text-fg" aria-label={`Pré-visualizar checkout de ${p.name}`}>
                      <Eye className="h-4 w-4" />
                    </Link>
                  </div>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
