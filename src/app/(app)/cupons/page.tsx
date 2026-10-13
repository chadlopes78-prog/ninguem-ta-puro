import type { Metadata } from "next";
import Link from "next/link";
import { Plus, TicketPercent } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { listCoupons } from "@/server/services/coupons";
import { listProductOptions } from "@/server/services/products";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ListFilters } from "@/components/filters/list-filters";
import { RowMenu } from "@/components/ui/row-menu";
import { CouponTester } from "@/components/coupons/coupon-tester";
import { deleteCouponAction, setCouponActiveAction, testCouponAction } from "./actions";

export const metadata: Metadata = { title: "Cupons" };

export default async function CouponsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings, scope } = await getScope();
  const [coupons, products] = await Promise.all([listCoupons({ scope, q: sp.q?.slice(0, 32), state: sp.state }), listProductOptions(scope)]);
  const now = new Date();
  const stateOf = (c: (typeof coupons)[number]) =>
    !c.isActive ? <Badge>Inativo</Badge> : c.endsAt && c.endsAt <= now ? <Badge tone="danger">Expirado</Badge> : c.startsAt && c.startsAt > now ? <Badge tone="info">Agendado</Badge> : c.maxUses !== null && c.usesCount >= c.maxUses ? <Badge tone="warning">Esgotado</Badge> : <Badge tone="success" dot>Ativo</Badge>;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Cupons {isDemo && <DemoBadge />}</span>}
        description="Descontos validados no servidor antes de serem aplicados no checkout."
        actions={<LinkButton href="/cupons/novo"><Plus className="h-4 w-4" /> Novo cupão</LinkButton>}
      />
      <Card className="mb-5">
        <CardHeader title="Testar cupão" description="Verifica validade, datas, limite, moeda e elegibilidade sem consumir utilizações." />
        <CardBody>
          <CouponTester action={testCouponAction} products={products} />
        </CardBody>
      </Card>
      <Card>
        <div className="border-b border-line p-4">
          <ListFilters placeholder="Pesquisar código…" selects={[{ name: "state", label: "Estado", options: [{ value: "", label: "Todos" }, { value: "active", label: "Ativos" }, { value: "inactive", label: "Inativos" }] }]} />
        </div>
        <DataTable
          rows={coupons}
          rowKey={(c) => c.id}
          columns={[
            { key: "code", header: "Código", mobile: "title", cell: (c) => <Link href={`/cupons/${c.id}`} className="font-mono text-[13px] font-medium hover:text-accent">{c.code}</Link> },
            { key: "discount", header: "Desconto", mobile: "end", cell: (c) => <span className="font-medium tabular">{c.type === "PERCENT" ? `${c.percentOff}%` : formatMoney(c.amountOffCents ?? 0, c.currency ?? settings.defaultCurrency)}</span> },
            { key: "products", header: "Produtos", cell: (c) => <span className="block max-w-[220px] truncate text-muted">{c.appliesToAll ? "Todos" : c.products.map((p) => p.product.name).join(", ")}</span> },
            { key: "validity", header: "Validade", cell: (c) => <span className="text-muted tabular">{c.startsAt ? formatDate(c.startsAt, settings.timezone) : "—"} → {c.endsAt ? formatDate(new Date(c.endsAt.getTime() - 1), settings.timezone) : "sem fim"}</span> },
            { key: "uses", header: "Utilizações", align: "right", cell: (c) => <span className="text-muted tabular">{c.usesCount}{c.maxUses !== null ? ` / ${c.maxUses}` : ""}</span> },
            { key: "state", header: "Estado", mobile: "end", cell: stateOf },
            {
              key: "actions",
              header: <span className="sr-only">Ações</span>,
              align: "right",
              mobile: "hide",
              cell: (c) => (
                <RowMenu
                  label={`Ações para ${c.code}`}
                  items={[
                    { kind: "link", label: "Editar", href: `/cupons/${c.id}` },
                    { kind: "action", label: c.isActive ? "Desativar" : "Ativar", run: setCouponActiveAction.bind(null, c.id, !c.isActive) },
                    { kind: "action", label: "Eliminar", danger: true, confirm: `Eliminar o cupão ${c.code}? Cupões já usados em pedidos não podem ser eliminados.`, run: deleteCouponAction.bind(null, c.id) },
                  ]}
                />
              ),
            },
          ]}
          empty={<EmptyState icon={TicketPercent} title={sp.q || sp.state ? "Nenhum cupão encontrado" : "Sem cupões"} action={!sp.q && !sp.state ? <LinkButton href="/cupons/novo"><Plus className="h-4 w-4" /> Criar cupão</LinkButton> : undefined} />}
        />
      </Card>
    </>
  );
}
