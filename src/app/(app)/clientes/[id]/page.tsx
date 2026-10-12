import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getCustomer } from "@/server/services/orders";
import { NotFoundError } from "@/server/services/products";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { StatCard } from "@/components/ui/stat-card";
import { OrderStatusBadge } from "@/components/orders/status";

export const metadata: Metadata = { title: "Cliente" };

export default async function CustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { isDemo, settings } = await getScope();
  const c = await getCustomer(id, isDemo).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const confirmed = new Map<CurrencyCode, number>();
  for (const o of c.orders) if (o.status === "APPROVED") confirmed.set(o.currency, (confirmed.get(o.currency) ?? 0) + o.totalCents);
  const first = c.orders.at(-1);

  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Clientes", href: "/clientes" }, { label: c.name }]} title={<span className="flex flex-wrap items-center gap-3">{c.name} {isDemo && <DemoBadge />}</span>} description={c.email} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pedidos" value={c.orders.length} />
        <StatCard label="Compras confirmadas" value={confirmed.size ? [...confirmed].map(([cur, v]) => formatMoney(v, cur)).join(" · ") : "—"} />
        <StatCard label="Primeiro pedido" value={first ? formatDate(first.createdAt, settings.timezone) : "—"} />
        <StatCard label="Cliente desde" value={formatDate(c.createdAt, settings.timezone)} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Histórico de pedidos" />
          <DataTable
            rows={c.orders}
            rowKey={(o) => o.id}
            columns={[
              { key: "code", header: "Pedido", mobile: "title", cell: (o) => <Link href={`/pedidos/${o.id}`} className="font-mono text-[13px] hover:text-accent">{o.code}</Link> },
              { key: "items", header: "Itens", cell: (o) => <span className="block max-w-[260px] truncate text-muted">{o.items.map((i) => i.description).join(", ")}</span> },
              { key: "date", header: "Data", cell: (o) => <span className="text-muted tabular">{formatDate(o.createdAt, settings.timezone, true)}</span> },
              { key: "total", header: "Valor", align: "right", mobile: "end", cell: (o) => <span className="font-medium tabular">{formatMoney(o.totalCents, o.currency)}</span> },
              { key: "status", header: "Estado", mobile: "end", cell: (o) => <OrderStatusBadge status={o.status} /> },
            ]}
            empty={<p className="p-5 text-sm text-subtle">Sem pedidos.</p>}
          />
        </Card>
        <Card>
          <CardHeader title="Contacto" />
          <CardBody className="grid gap-2 text-sm">
            <p><span className="text-muted">Email: </span>{c.email}</p>
            <p><span className="text-muted">Telefone: </span>{c.phone ?? "—"}</p>
            <p><span className="text-muted">Documento: </span>{c.document ? `•••${c.document.slice(-3)}` : "—"}</p>
            <p className="mt-2 text-[12px] text-subtle">O documento é apresentado parcialmente para proteção de dados.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
