import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { listOrders, ORDER_STATUSES } from "@/server/services/orders";
import { listProductOptions } from "@/server/services/products";
import { ORDER_STATUS_LABELS } from "@/server/services/order-logic";
import { RANGE_LABELS, resolveRange } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ListFilters } from "@/components/filters/list-filters";
import { OrderStatusBadge } from "@/components/orders/status";
import { ManualOrderButton } from "@/components/orders/manual-order-button";
import { createManualOrderAction } from "./actions";

export const metadata: Metadata = { title: "Pedidos" };

const PERIODS = ["today", "7d", "30d", "90d", "month", "prevmonth"] as const;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings, scope } = await getScope();
  const status = ORDER_STATUSES.includes(sp.status as OrderStatus) ? (sp.status as OrderStatus) : undefined;
  const period = PERIODS.includes(sp.periodo as (typeof PERIODS)[number]) ? sp.periodo : undefined;
  const range = period ? resolveRange({ preset: period }, settings.timezone) : null;
  const page = Math.max(1, Number.parseInt(sp.page ?? "1", 10) || 1);
  const [result, products] = await Promise.all([
    listOrders({ scope, status, q: sp.q?.slice(0, 100), from: range?.from, to: range?.to, productId: sp.produto || undefined, page }),
    listProductOptions(scope),
  ]);
  const hrefFor = (p: number) => {
    const u = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]);
    u.set("page", String(p));
    return `/pedidos?${u}`;
  };

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Pedidos {isDemo && <DemoBadge />}</span>}
        description={isDemo ? "Pedidos de demonstração." : "Pedidos só são aprovados mediante confirmação do processador de pagamentos."}
        actions={<ManualOrderButton action={createManualOrderAction} products={products} isDemo={isDemo} />}
      />
      <Card>
        <div className="border-b border-line p-4">
          <ListFilters
            placeholder="Pedido, nome ou email do cliente…"
            selects={[
              { name: "status", label: "Estado", options: [{ value: "", label: "Todos os estados" }, ...ORDER_STATUSES.map((s) => ({ value: s, label: ORDER_STATUS_LABELS[s] }))] },
              { name: "periodo", label: "Período", options: [{ value: "", label: "Todo o período" }, ...PERIODS.map((p) => ({ value: p, label: RANGE_LABELS[p] }))] },
              { name: "produto", label: "Produto", options: [{ value: "", label: "Todos os produtos" }, ...products.map((p) => ({ value: p.id, label: p.name }))] },
            ]}
          />
        </div>
        <DataTable
          rows={result.rows}
          rowKey={(o) => o.id}
          columns={[
            {
              key: "code",
              header: "Pedido",
              mobile: "title",
              cell: (o) => (
                <Link href={`/pedidos/${o.id}`} className="font-mono text-[13px] text-fg hover:text-accent">
                  {o.code}
                </Link>
              ),
            },
            { key: "customer", header: "Cliente", cell: (o) => <span className="block max-w-[160px] truncate text-muted">{o.customer.name}<span className="block truncate text-[12px] text-subtle">{o.customer.email}</span></span> },
            { key: "product", header: "Produto", className: "hidden xl:table-cell", cell: (o) => <span className="block max-w-[220px] truncate text-muted">{o.items[0]?.product.name}{o.items.length > 1 && <span className="text-subtle"> +{o.items.length - 1}</span>}</span> },
            { key: "date", header: "Data", cell: (o) => <span className="text-muted tabular">{formatDate(o.createdAt, settings.timezone, true)}</span> },
            { key: "total", header: "Valor", align: "right", mobile: "end", cell: (o) => <span className="font-medium tabular">{formatMoney(o.totalCents, o.currency)}</span> },
            {
              key: "status",
              header: "Estado",
              mobile: "end",
              // estado + origem quando não é uma venda normal (teste manual, demonstração, pagamento de teste)
              cell: (o) => (
                <span className="flex flex-col items-start gap-1 max-lg:items-end">
                  <OrderStatusBadge status={o.status} />
                  {(o.status === "DECLINED" || o.status === "CANCELED") && o.payments[0]?.failureReason && (
                    <span className="max-w-[200px] text-[12px] leading-snug text-muted max-lg:text-right" data-testid="order-justification" data-code={o.payments[0].failureCode ?? ""}>
                      {o.payments[0].failureReason}
                    </span>
                  )}
                  {o.source === "MANUAL_TEST" ? <Badge tone="info">Teste manual</Badge> : o.source === "DEMO" ? <Badge tone="demo">Demo</Badge> : o.isTestPayment ? <Badge tone="warning">Pagamento de teste</Badge> : null}
                </span>
              ),
            },
          ]}
          empty={
            <EmptyState
              icon={Receipt}
              title={sp.q || status || period || sp.produto ? "Nenhum pedido corresponde aos filtros" : "Ainda não existem pedidos"}
              description={sp.q || status || period ? "Ajuste a pesquisa ou os filtros." : "Os pedidos aparecem aqui quando forem criados pelos checkouts."}
            />
          }
        />
        <Pagination page={result.page} pages={result.pages} total={result.total} makeHref={hrefFor} />
      </Card>
    </>
  );
}
