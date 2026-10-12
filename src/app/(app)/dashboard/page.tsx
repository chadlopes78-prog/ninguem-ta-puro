import type { Metadata } from "next";
import Link from "next/link";
import { Info, Package, Receipt, Sparkles } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getDashboardData } from "@/server/services/metrics";
import { percentChange } from "@/server/services/metrics-logic";
import { ORDER_STATUS_LABELS } from "@/server/services/order-logic";
import { resolveRange } from "@/lib/dates";
import { CURRENCIES, formatMoney, type CurrencyCode } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DemoBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { RangeFilter } from "@/components/filters/range-filter";
import { OrdersChart, RevenueChart } from "@/components/charts/charts";
import { BarList } from "@/components/charts/bar-list";
import { OrderStatusBadge, STATUS_COLOR } from "@/components/orders/status";

export const metadata: Metadata = { title: "Dashboard" };

type SP = Promise<Record<string, string | undefined>>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings } = await getScope();
  const tz = settings.timezone;
  const range = resolveRange({ preset: sp.range, from: sp.from, to: sp.to }, tz);
  const reqCurrency = CURRENCIES.includes(sp.currency as CurrencyCode) ? (sp.currency as CurrencyCode) : undefined;
  const d = await getDashboardData({ isDemo, range, currency: reqCurrency, defaultCurrency: settings.defaultCurrency, tz });
  const k = d.kpis;
  const p = d.previousKpis;
  const m = (c: number) => formatMoney(c, d.currency);

  const header = (
    <PageHeader
      title={
        <span className="flex flex-wrap items-center gap-3">
          Dashboard {isDemo && <DemoBadge />}
        </span>
      }
      description={`${range.label} · valores em ${d.currency} · fuso ${tz}`}
    />
  );

  if (!d.hasAnyOrder) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={Sparkles}
            title="Ainda não existem vendas"
            description={
              isDemo
                ? "Não há dados de demonstração. Pode gerá-los em Configurações → Modo de demonstração."
                : "Quando o processador de pagamentos for integrado, as vendas confirmadas aparecem aqui. Comece por criar um produto e um checkout."
            }
            action={
              <>
                <LinkButton href="/produtos/novo">Criar produto</LinkButton>
                <LinkButton href="/configuracoes#demo" variant="secondary">
                  Explorar com dados de demonstração
                </LinkButton>
              </>
            }
          />
        </Card>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="mb-6">
        <RangeFilter preset={range.preset} from={sp.from} to={sp.to} currencies={d.currencies.length > 1 ? d.currencies : undefined} currency={d.currency} />
      </div>

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard highlight label="Faturação bruta" value={m(k.grossCents)} delta={percentChange(k.grossCents, p.grossCents)} hint="Soma dos pedidos aprovados no período (após descontos). Pendentes, recusados, cancelados e reembolsados não entram." sub={`Anterior: ${m(p.grossCents)}`} />
        <StatCard label="Pedidos aprovados" value={k.approvedCount} delta={percentChange(k.approvedCount, p.approvedCount)} sub={`${k.totalOrders} pedidos no total`} />
        <StatCard label="Ticket médio" value={k.avgTicketCents === null ? "—" : m(k.avgTicketCents)} hint="Faturação bruta ÷ pedidos aprovados." sub={k.avgTicketCents === null ? "Sem pedidos aprovados" : "Por pedido aprovado"} />
        <StatCard
          label="Conversão do checkout"
          value={k.conversionRate === null ? "—" : `${k.conversionRate.toLocaleString("pt-MZ")}%`}
          hint="Pedidos aprovados com checkout de origem ÷ sessões de checkout registadas × 100."
          sub={k.conversionRate === null ? "Sem sessões de checkout registadas" : `${k.checkoutSessions} sessões`}
        />
        <StatCard label="Valor líquido estimado" value={m(k.netCents)} hint="Faturação bruta − taxas efetivamente registadas nos pedidos. Nenhum custo é estimado ou inventado." sub={`Taxas registadas: ${m(k.feeCents)}`} />
        <StatCard label="Pedidos pendentes" value={k.pendingCount} sub={`${m(k.pendingCents)} aguardam confirmação`} />
        <StatCard label="Reembolsos" value={k.refundCount} invertDelta delta={percentChange(k.refundCount, p.refundCount)} hint="Pedidos reembolsados deixam de estar aprovados, por isso não entram na faturação bruta." sub={m(k.refundCents)} />
        <StatCard label="Total de pedidos" value={k.totalOrders} delta={percentChange(k.totalOrders, p.totalOrders)} sub="Todos os estados" />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Evolução da faturação"
            description="Faturação por dia comparada com o período anterior"
            action={
              <div className="flex items-center gap-3 text-[12px] text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3.5 rounded bg-accent" aria-hidden="true" /> Atual
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-0.5 w-3.5 bg-[repeating-linear-gradient(90deg,#6c737d_0_3px,transparent_3px_5px)]" aria-hidden="true" /> Anterior
                </span>
              </div>
            }
          />
          <CardBody className="pl-2 sm:pl-3">
            <RevenueChart data={d.series} currency={d.currency} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Estado dos pedidos" description="Distribuição no período" />
          <CardBody>
            <BarList
              items={d.statuses.map((s) => ({
                key: s.status,
                label: ORDER_STATUS_LABELS[s.status],
                value: s.count,
                display: String(s.count),
                color: STATUS_COLOR[s.status],
              }))}
            />
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Pedidos aprovados por dia" description="Número de pedidos aprovados" />
          <CardBody className="pl-2 sm:pl-3">
            <OrdersChart data={d.series} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Desempenho por produto" description="Faturação aprovada no período" />
          <CardBody>
            <BarList
              items={d.products.map((pr) => ({
                key: pr.productId,
                label: pr.name,
                value: pr.revenueCents,
                display: m(pr.revenueCents),
                sub: `${pr.units} un.`,
              }))}
            />
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Atividade recente" description="Últimos pedidos registados" action={<LinkButton href="/pedidos" variant="ghost" size="sm">Ver todos</LinkButton>} />
        <DataTable
          rows={d.recent}
          rowKey={(r) => r.id}
          columns={[
            { key: "code", header: "Pedido", mobile: "title", cell: (r) => <Link href={`/pedidos/${r.id}`} className="font-mono text-[13px] text-fg hover:text-accent">{r.code}</Link> },
            { key: "product", header: "Produto", cell: (r) => <span className="text-muted">{r.items[0]?.product.name ?? "—"}</span> },
            { key: "customer", header: "Cliente", cell: (r) => <span className="text-muted">{r.customer.name}</span> },
            { key: "date", header: "Data", cell: (r) => <span className="text-muted tabular">{formatDate(r.createdAt, tz, true)}</span> },
            { key: "value", header: "Valor", align: "right", mobile: "end", cell: (r) => <span className="font-medium tabular">{formatMoney(r.totalCents, r.currency)}</span> },
            { key: "status", header: "Estado", mobile: "end", cell: (r) => <OrderStatusBadge status={r.status} /> },
          ]}
          empty={<EmptyState icon={Receipt} title="Sem pedidos" />}
        />
      </Card>

      <p className="mt-4 flex items-start gap-2 text-[12px] text-subtle">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {isDemo
          ? "Dados fictícios de demonstração — não representam faturação real nem são incluídos nos relatórios reais."
          : "Métricas calculadas a partir de pedidos persistidos. Moedas diferentes nunca são somadas."}
        <Link href="/relatorios" className="ml-auto shrink-0 text-muted underline-offset-2 hover:text-fg hover:underline">
          <Package className="sr-only" /> Relatórios
        </Link>
      </p>
    </>
  );
}
