import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { listCustomers } from "@/server/services/orders";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/filters/list-filters";

export const metadata: Metadata = { title: "Clientes" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings, scope } = await getScope();
  const rows = await listCustomers({ scope, q: sp.q?.slice(0, 100), hasPurchases: sp.compras === "sim" });
  return (
    <>
      <PageHeader title={<span className="flex flex-wrap items-center gap-3">Clientes {isDemo && <DemoBadge />}</span>} description="Dados pessoais visíveis apenas para utilizadores autenticados." />
      <Card>
        <div className="border-b border-line p-4">
          <ListFilters placeholder="Nome ou email…" selects={[{ name: "compras", label: "Compras", options: [{ value: "", label: "Todos os clientes" }, { value: "sim", label: "Com compras confirmadas" }] }]} />
        </div>
        <DataTable
          rows={rows}
          rowKey={(c) => c.id}
          columns={[
            { key: "name", header: "Cliente", mobile: "title", cell: (c) => <Link href={`/clientes/${c.id}`} className="block min-w-0 hover:text-accent"><span className="block truncate font-medium">{c.name}</span><span className="block truncate text-[12px] text-subtle">{c.email}</span></Link> },
            { key: "phone", header: "Telefone", mobile: "hide", cell: (c) => <span className="text-muted">{c.phone ?? "—"}</span> },
            { key: "first", header: "Primeiro pedido", cell: (c) => <span className="text-muted tabular">{c.firstOrderAt ? formatDate(c.firstOrderAt, settings.timezone) : "—"}</span> },
            { key: "orders", header: "Pedidos", align: "right", cell: (c) => <span className="tabular text-muted">{c.ordersCount}</span> },
            {
              key: "value",
              header: "Compras confirmadas",
              align: "right",
              mobile: "end",
              cell: (c) => (c.confirmed.length ? <span className="font-medium tabular">{c.confirmed.map((x) => formatMoney(x.cents, x.currency)).join(" · ")}</span> : <span className="text-subtle">—</span>),
            },
          ]}
          empty={<EmptyState icon={Users} title={sp.q || sp.compras ? "Nenhum cliente encontrado" : "Ainda não existem clientes"} description={sp.q ? undefined : "Os clientes são criados automaticamente a partir dos pedidos."} />}
        />
      </Card>
    </>
  );
}
