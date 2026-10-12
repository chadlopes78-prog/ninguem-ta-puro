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
import { ProductCover } from "@/components/products/cover";
import { PRODUCT_STATUS_LABELS, PRODUCT_STATUS_TONE, PRODUCT_TYPE_LABELS } from "@/components/products/labels";
import { duplicateProductAction, setProductStatusAction } from "./actions";

export const metadata: Metadata = { title: "Produtos" };

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings } = await getScope();
  const status = (["ALL", "ACTIVE", "DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"].includes(sp.status ?? "") ? sp.status : "ACTIVE") as ProductListQuery["status"];
  const type = Object.keys(PRODUCT_TYPE_LABELS).includes(sp.type ?? "") ? (sp.type as ProductType) : undefined;
  const sort = (["newest", "oldest", "name", "price_desc", "price_asc", "orders"].includes(sp.sort ?? "") ? sp.sort : "newest") as ProductListQuery["sort"];
  const products = await listProducts({ isDemo, q: sp.q?.slice(0, 100), status, type, sort });
  const filtered = Boolean(sp.q || sp.type || (sp.status && sp.status !== "ACTIVE"));

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
            placeholder="Pesquisar por nome ou categoria…"
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
              cell: (p) => (
                <Link href={`/produtos/${p.id}`} className="flex min-w-0 items-center gap-3 hover:text-accent">
                  <ProductCover src={p.imageUrl} name={p.name} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg">{p.name}</span>
                    {p.category && <span className="block truncate text-[12px] text-subtle">{p.category}</span>}
                  </span>
                </Link>
              ),
            },
            { key: "type", header: "Tipo", cell: (p) => <span className="text-muted">{PRODUCT_TYPE_LABELS[p.type]}</span> },
            { key: "price", header: "Preço", mobile: "end", align: "right", cell: (p) => <span className="font-medium tabular">{p.defaultOffer ? formatMoney(p.defaultOffer.priceCents, p.defaultOffer.currency) : "—"}</span> },
            { key: "status", header: "Estado", mobile: "end", cell: (p) => <Badge tone={PRODUCT_STATUS_TONE[p.status]} dot>{PRODUCT_STATUS_LABELS[p.status]}</Badge> },
            { key: "orders", header: "Pedidos", align: "right", cell: (p) => <span className="text-muted tabular">{p._count.orderItems}</span> },
            { key: "created", header: "Criado em", cell: (p) => <span className="text-muted tabular">{formatDate(p.createdAt, settings.timezone)}</span> },
            {
              key: "actions",
              header: <span className="sr-only">Ações</span>,
              align: "right",
              mobile: "hide",
              cell: (p) => (
                <RowMenu
                  label={`Ações para ${p.name}`}
                  items={[
                    { kind: "link", label: "Editar", href: `/produtos/${p.id}` },
                    { kind: "link", label: "Criar checkout", href: `/checkouts/novo?productId=${p.id}` },
                    { kind: "action", label: "Duplicar", run: duplicateProductAction.bind(null, p.id) },
                    ...(p.status === "PUBLISHED"
                      ? [{ kind: "action" as const, label: "Despublicar", run: setProductStatusAction.bind(null, p.id, "UNPUBLISHED") }]
                      : p.status !== "ARCHIVED"
                        ? [{ kind: "action" as const, label: "Publicar", run: setProductStatusAction.bind(null, p.id, "PUBLISHED") }]
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
