import type { Metadata } from "next";
import Link from "next/link";
import { Package, Plus } from "lucide-react";
import type { ProductStatus, ProductType } from "@prisma/client";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { listProducts, type ProductListQuery } from "@/server/services/products";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/filters/list-filters";
import { RowMenu } from "@/components/ui/row-menu";
import { CopyButton } from "@/components/ui/copy-button";
import { checkoutPath } from "@/server/services/primary-checkout";
import { ProductCover } from "@/components/products/cover";
import { PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS } from "@/components/products/labels";
import { duplicateProductAction, publishProductAction, setProductStatusAction } from "./actions";
import { readinessMap } from "@/server/services/product-readiness";
import { STAGE_LABELS, type ProductStage } from "@/lib/product-setup";

const STAGE_TONE: Record<ProductStage, "neutral" | "success" | "warning" | "info" | "danger"> = {
  draft: "neutral",
  incomplete: "warning",
  ready: "info",
  published: "success",
  published_incomplete: "warning",
  unpublished: "neutral",
  archived: "neutral",
};

export const metadata: Metadata = { title: "Produtos" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings, scope } = await getScope();
  const status = (["ALL", "ACTIVE", "DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"].includes(sp.status ?? "") ? sp.status : "ACTIVE") as ProductListQuery["status"];
  const type = Object.keys(PRODUCT_TYPE_LABELS).includes(sp.type ?? "") ? (sp.type as ProductType) : undefined;
  const sort = (["newest", "oldest", "name", "price_desc", "price_asc", "orders"].includes(sp.sort ?? "") ? sp.sort : "newest") as ProductListQuery["sort"];
  const products = await listProducts({ scope, q: sp.q?.slice(0, 100), status, type, sort });
  const filtered = Boolean(sp.q || sp.type || (sp.status && sp.status !== "ACTIVE"));
  const readiness = await readinessMap(products.map((p) => p.id), scope);
  const stageBadge = (p: (typeof products)[number]) => {
    const st = readiness.get(p.id)?.stage ?? (p.status === "UNPUBLISHED" ? "unpublished" : "draft");
    const stage: ProductStage = p.status === "UNPUBLISHED" && st === "incomplete" ? "incomplete" : st;
    return (
      <span data-testid="product-stage" data-stage={stage}>
        <Badge tone={STAGE_TONE[stage]} dot>
          {STAGE_LABELS[stage]}
        </Badge>
      </span>
    );
  };

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Produtos {isDemo && <DemoBadge />}</span>}
        description="Catálogo de produtos digitais, preços e ofertas."
        actions={
          <LinkButton href="/produtos/novo">
            <Plus className="h-4 w-4" /> Novo produto
          </LinkButton>
        }
      />
      <Card>
        <div className="border-b border-line p-4">
          <ListFilters
            placeholder="Pesquisar produtos…"
            selects={[
              {
                name: "status",
                label: "Estado",
                options: [
                  { value: "", label: "Ativos (sem arquivados)" },
                  { value: "ALL", label: "Todos os estados" },
                  ...(["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"] as ProductStatus[]).map((s) => ({ value: s, label: PRODUCT_STATUS_LABELS[s] })),
                ],
              },
              { name: "type", label: "Tipo", options: [{ value: "", label: "Todos os tipos" }, ...Object.entries(PRODUCT_TYPE_LABELS).map(([value, label]) => ({ value, label }))] },
              {
                name: "sort",
                label: "Ordenar",
                options: [
                  { value: "", label: "Mais recentes" },
                  { value: "oldest", label: "Mais antigos" },
                  { value: "name", label: "Nome (A–Z)" },
                  { value: "price_desc", label: "Preço (maior)" },
                  { value: "price_asc", label: "Preço (menor)" },
                  { value: "orders", label: "Mais pedidos" },
                ],
              },
            ]}
          />
        </div>
        <DataTable
          rows={products}
          rowKey={(p) => p.id}
          columns={[
            {
              key: "name",
              header: "Produto",
              mobile: "title",
              className: "min-w-[200px]",
              cell: (p) => (
                <Link href={`/produtos/${p.id}`} className="flex min-w-0 items-center gap-3 hover:text-accent">
                  <ProductCover src={p.imageUrl} name={p.name} />
                  <span className="min-w-0">
                    <span className="block font-medium text-fg [overflow-wrap:anywhere] line-clamp-2">{p.name}</span>
                    <span className="block truncate text-[12px] text-subtle">
                      {PRODUCT_TYPE_LABELS[p.type]}
                      {p.category && ` · ${p.category}`}
                    </span>
                  </span>
                </Link>
              ),
            },
            { key: "price", header: "Preço", mobile: "meta", align: "right", className: "whitespace-nowrap", cell: (p) => <span className="font-medium tabular">{p.defaultOffer ? formatMoney(p.defaultOffer.priceCents, p.defaultOffer.currency) : "—"}</span> },
            {
              key: "status",
              header: "Estado",
              mobile: "meta",
              // estado + (só se faltar algo essencial, como a entrega) atalho para o configurar
              cell: (p) => {
                const r = readiness.get(p.id);
                return (
                  <span className="flex min-w-0 flex-col items-start gap-1">
                    {stageBadge(p)}
                    {r && !r.ready && p.status !== "ARCHIVED" && (
                      <Link href={r.missing[0].href} className="w-fit text-[12px] font-medium text-warning hover:underline" data-testid="product-incomplete">
                        {r.missing.some((x) => x.key === "delivery" || x.key === "deliveryContent") ? "Configurar entrega →" : `${r.missing[0].label} em falta →`}
                      </Link>
                    )}
                  </span>
                );
              },
              mobileCell: (p) => stageBadge(p),
            },
            {
              key: "setup",
              header: "Configuração",
              mobile: "block",
              mobileOnly: true,
              cell: (p) => {
                const r = readiness.get(p.id);
                if (!r || r.ready || p.status === "ARCHIVED") return r?.ready ? <span className="text-[12.5px] text-success">Pronto para vender</span> : null;
                return (
                  <Link href={r.missing[0].href} className="text-[12.5px] font-medium text-warning hover:underline" data-testid="product-incomplete">
                    {r.missing.some((x) => x.key === "delivery" || x.key === "deliveryContent") ? "Configure a entrega do produto para o poder publicar →" : `${r.missing[0].label} em falta →`}
                  </Link>
                );
              },
            },
            {
              key: "link",
              header: "Link do checkout",
              mobile: "meta",
              className: "whitespace-nowrap",
              cell: (p) =>
                p.primaryCheckout ? (
                  <span className="flex min-w-0 items-center gap-2" data-testid="product-row-link" data-path={checkoutPath(p.primaryCheckout)}>
                    <span className="hidden max-w-[220px] truncate font-mono text-[12px] text-muted 2xl:inline-block" title={checkoutPath(p.primaryCheckout)}>
                      {checkoutPath(p.primaryCheckout)}
                    </span>
                    <CopyButton value={checkoutPath(p.primaryCheckout)} size="sm" label="Copiar link" />
                  </span>
                ) : (
                  <span className="text-subtle">—</span>
                ),
            },
            { key: "orders", header: "Pedidos", align: "right", mobile: "hide", className: "hidden xl:table-cell", cell: (p) => <span className="text-muted tabular">{p._count.orderItems}</span> },
            { key: "created", header: "Criado em", mobile: "hide", className: "hidden whitespace-nowrap 2xl:table-cell", cell: (p) => <span className="text-muted tabular">{formatDate(p.createdAt, settings.timezone)}</span> },
            {
              key: "actions",
              header: <span className="sr-only">Ações</span>,
              align: "right",
              mobile: "action",
              cell: (p) => (
                <RowMenu
                  label={`Ações para ${p.name}`}
                  items={[
                    { kind: "link", label: "Editar", href: `/produtos/${p.id}` },
                    { kind: "link", label: "Personalizar checkout", href: `/checkouts/personalizar/${p.id}` },
                    ...(p.primaryCheckout ? [{ kind: "link" as const, label: "Abrir checkout", href: checkoutPath(p.primaryCheckout) }] : []),
                    { kind: "action", label: "Duplicar", run: duplicateProductAction.bind(null, p.id) },
                    ...(p.status === "PUBLISHED"
                      ? [{ kind: "action" as const, label: "Despublicar", run: setProductStatusAction.bind(null, p.id, "UNPUBLISHED") }]
                      : p.status !== "ARCHIVED"
                        ? [{ kind: "action" as const, label: "Publicar", run: publishProductAction.bind(null, p.id) }]
                        : [{ kind: "action" as const, label: "Restaurar", run: setProductStatusAction.bind(null, p.id, "DRAFT") }]),
                    ...(p.status !== "ARCHIVED"
                      ? [{ kind: "action" as const, label: "Arquivar", danger: true, confirm: `Arquivar “${p.name}”? Os checkouts deste produto deixam de estar disponíveis. Pode restaurá-lo depois.`, run: setProductStatusAction.bind(null, p.id, "ARCHIVED") }]
                      : []),
                  ]}
                />
              ),
            },
          ]}
          empty={
            filtered ? (
              <EmptyState icon={Package} title="Nenhum produto encontrado" description="Ajuste a pesquisa ou os filtros." />
            ) : (
              <EmptyState
                icon={Package}
                title="Ainda não tem produtos"
                description="Crie o seu primeiro produto digital para começar a vender."
                action={<LinkButton href="/produtos/novo"><Plus className="h-4 w-4" /> Criar primeiro produto</LinkButton>}
              />
            )
          }
        />
      </Card>
    </>
  );
}
