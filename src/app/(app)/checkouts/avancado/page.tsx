import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard, ExternalLink, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { listCheckouts } from "@/server/services/checkouts";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/filters/list-filters";
import { CopyButton } from "@/components/ui/copy-button";
import { RowMenu } from "@/components/ui/row-menu";
import { deleteCheckoutAction, duplicateCheckoutAction, setCheckoutActiveAction } from "../actions";

export const metadata: Metadata = { title: "Todos os checkouts" };

export default async function CheckoutsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo } = await getScope();
  const state = sp.state === "active" || sp.state === "inactive" ? sp.state : "all";
  const rows = await listCheckouts({ isDemo, q: sp.q?.slice(0, 100), state });

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Produtos", href: "/produtos" }, { label: "Todos os checkouts" }]}
        title={<span className="flex flex-wrap items-center gap-3">Todos os checkouts {isDemo && <DemoBadge />}</span>}
        description="Área avançada: inclui o checkout principal de cada produto e checkouts adicionais (por exemplo, com outra oferta ou preço). Não é preciso criar checkouts aqui — cada produto já tem o seu."
        actions={<LinkButton href="/checkouts/novo" variant="secondary"><Plus className="h-4 w-4" /> Checkout adicional</LinkButton>}
      />
      <Card>
        <div className="border-b border-line p-4">
          <ListFilters
            placeholder="Pesquisar checkouts…"
            selects={[{ name: "state", label: "Estado", options: [{ value: "", label: "Todos" }, { value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }] }]}
          />
        </div>
        <DataTable
          rows={rows}
          rowKey={(c) => c.id}
          columns={[
            {
              key: "name",
              header: "Checkout",
              mobile: "title",
              cell: (c) => (
                <Link href={`/checkouts/${c.id}`} className="block min-w-0 hover:text-accent">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate font-mono text-[11.5px] text-subtle">/checkout/{c.slug ?? c.publicId}</span>
                </Link>
              ),
            },
            { key: "product", header: "Produto / oferta", cell: (c) => <span className="text-muted">{c.product.name} · {c.offer.name}</span> },
            { key: "price", header: "Preço", align: "right", mobile: "end", cell: (c) => <span className="font-medium tabular">{formatMoney(c.offer.priceCents, c.offer.currency)}</span> },
            {
              key: "state",
              header: "Estado",
              mobile: "end",
              cell: (c) =>
                !c.isActive ? <Badge>Inativo</Badge> : c.product.status !== "PUBLISHED" ? <Badge tone="warning">Produto não publicado</Badge> : <Badge tone="success" dot>Ativo</Badge>,
            },
            { key: "funnel", header: "Funil", cell: (c) => (c.funnel ? <Link href={`/funis/${c.funnel.id}`} className="text-muted hover:text-fg">{c.funnel.name}</Link> : <span className="text-subtle">—</span>) },
            { key: "stats", header: "Sessões / pedidos", align: "right", cell: (c) => <span className="text-muted tabular">{c._count.sessions} / {c._count.orders}</span> },
            {
              key: "actions",
              header: <span className="sr-only">Ações</span>,
              align: "right",
              mobile: "meta",
              cell: (c) => (
                <div className="flex items-center justify-end gap-1">
                  <CopyButton value={`/checkout/${c.slug ?? c.publicId}`} size="icon" label={`Copiar link de ${c.name}`} />
                  <a href={`/checkout/${c.slug ?? c.publicId}`} target="_blank" rel="noopener" className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] text-muted hover:bg-surface-3 hover:text-fg" aria-label="Abrir checkout público">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                  <RowMenu
                    label={`Ações para ${c.name}`}
                    items={[
                      { kind: "link", label: "Editar", href: `/checkouts/${c.id}` },
                      { kind: "link", label: "Pré-visualizar", href: `/checkouts/${c.id}/preview` },
                      { kind: "action", label: "Duplicar", run: duplicateCheckoutAction.bind(null, c.id) },
                      { kind: "action", label: c.isActive ? "Desativar" : "Ativar", run: setCheckoutActiveAction.bind(null, c.id, !c.isActive) },
                      { kind: "action", label: "Eliminar", danger: true, confirm: "Eliminar este checkout? O link deixa de funcionar. Checkouts com pedidos não podem ser eliminados.", run: deleteCheckoutAction.bind(null, c.id) },
                    ]}
                  />
                </div>
              ),
            },
          ]}
          empty={
            sp.q || sp.state ? (
              <EmptyState icon={CreditCard} title="Nenhum checkout encontrado" />
            ) : (
              <EmptyState icon={CreditCard} title="Sem checkouts" description="Crie um checkout para gerar um link de venda para um produto." action={<LinkButton href="/checkouts/novo"><Plus className="h-4 w-4" /> Criar checkout</LinkButton>} />
            )
          }
        />
      </Card>
    </>
  );
}
