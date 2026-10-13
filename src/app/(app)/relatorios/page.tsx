import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, BarChart3, Download, Info, Search } from "lucide-react";
import type { OrderStatus } from "@prisma/client";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getReportsData } from "@/server/services/metrics";
import { getFinanceReport, listTransactions, transactionFilterOptions, TX_SORTS, type TxFilters, type TxSort } from "@/server/services/finance";
import { gatewayLabel } from "@/server/services/finance-logic";
import { percentChange } from "@/server/services/metrics-logic";
import { ORDER_STATUSES } from "@/server/services/orders";
import { ORDER_STATUS_LABELS } from "@/server/services/order-logic";
import { resolveRange } from "@/lib/dates";
import { CURRENCIES, formatMoney, type CurrencyCode } from "@/lib/money";
import { cn, formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { RangeFilter } from "@/components/filters/range-filter";
import { BarList } from "@/components/charts/bar-list";
import { DailyBars, GrossChart } from "@/components/charts/lazy-charts";
import { OrderStatusBadge } from "@/components/orders/status";

export const metadata: Metadata = { title: "Relatórios" };

const REFUND_COLOR = "var(--color-info)";

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings, scope } = await getScope();
  const tz = settings.timezone;
  const range = resolveRange({ preset: sp.range, from: sp.from, to: sp.to }, tz);
  const cur = CURRENCIES.includes(sp.currency as CurrencyCode) ? (sp.currency as CurrencyCode) : undefined;

  const filters: TxFilters = {
    q: sp.q?.slice(0, 100) || undefined,
    status: ORDER_STATUSES.includes(sp.estado as OrderStatus) ? (sp.estado as OrderStatus) : undefined,
    gateway: sp.gateway && /^[a-z0-9-]{1,40}$/.test(sp.gateway) ? sp.gateway : undefined,
    productId: sp.produto && /^[a-z0-9]{20,40}$/i.test(sp.produto) ? sp.produto : undefined,
    sort: TX_SORTS.includes(sp.ordem as TxSort) ? (sp.ordem as TxSort) : "date",
    dir: sp.dir === "asc" ? "asc" : "desc",
    page: Math.max(1, Number(sp.page) || 1),
    pageSize: 20,
  };

  const [fin, legacy, tx, opts] = await Promise.all([
    getFinanceReport({ scope, range, currency: cur, defaultCurrency: settings.defaultCurrency, tz }),
    getReportsData({ scope, range, currency: cur, defaultCurrency: settings.defaultCurrency, tz }),
    listTransactions(scope, range, filters),
    transactionFilterOptions(scope),
  ]);
  const c = fin.currency;
  const m = (v: number) => formatMoney(v, c);
  const k = fin.kpis;
  const p = fin.previousKpis;
  const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-MZ")}%`);
  const gatewayTotal = fin.gateways.reduce((a, g) => a + g.revenueCents, 0);

  // Ligações que preservam o período e os filtros
  const base: Record<string, string | undefined> = { range: sp.range, from: sp.from, to: sp.to, currency: sp.currency, q: filters.q, estado: filters.status, gateway: filters.gateway, produto: filters.productId, ordem: filters.sort === "date" ? undefined : filters.sort, dir: filters.dir === "desc" ? undefined : filters.dir };
  const qs = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ ...base, ...over }).filter(([, v]) => v) as [string, string][]);
    return q.toString();
  };
  const sortHref = (key: TxSort) => `/relatorios?${qs({ ordem: key === "date" ? undefined : key, dir: filters.sort === key && filters.dir === "desc" ? "asc" : undefined, page: undefined })}#transacoes`;
  const SortIcon = ({ k: key }: { k: TxSort }) => (filters.sort === key ? filters.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : null);
  const hasFilters = Boolean(filters.q || filters.status || filters.gateway || filters.productId);

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Relatórios {isDemo && <DemoBadge />}</span>}
        description={`${range.label} · ${c} · dias contados no fuso ${tz}`}
        actions={
          <a href={`/relatorios/exportar?${qs({})}`} className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-line px-3 text-[13px] font-medium text-fg hover:bg-surface-2" data-testid="export-csv">
            <Download className="h-4 w-4" /> Exportar CSV
          </a>
        }
      />
      <div className="mb-6">
        <RangeFilter preset={range.preset} from={sp.from} to={sp.to} currencies={fin.currencies.length > 1 ? fin.currencies : undefined} currency={c} />
      </div>

      {/* Indicadores principais */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5" aria-label="Indicadores financeiros" data-testid="finance-kpis">
        <div className="col-span-2 lg:col-span-1">
          <StatCard highlight label="Faturamento bruto" value={<span data-testid="kpi-gross">{m(k.grossCents)}</span>} delta={percentChange(k.grossCents, p.grossCents)} hint="Soma das vendas confirmadas pelo gateway no período (pela data de confirmação). Não é lucro." />
        </div>
        <StatCard label="Reembolsos" value={<span data-testid="kpi-refunds">{m(k.refundCents)}</span>} sub={`${k.refundCount} reembolso(s)`} delta={percentChange(k.refundCents, p.refundCents)} invertDelta />
        <StatCard label="Após reembolsos" value={<span data-testid="kpi-net">{m(k.netAfterRefundsCents)}</span>} hint="Faturamento bruto − reembolsos registados no período. Não é lucro nem saldo disponível." />
        <StatCard label="Vendas confirmadas" value={<span data-testid="kpi-sales">{k.salesCount}</span>} delta={percentChange(k.salesCount, p.salesCount)} />
        <StatCard label="Ticket médio" value={k.avgTicketCents === null ? "—" : m(k.avgTicketCents)} />
      </section>
      <section className="mt-3 grid grid-cols-2 gap-3 sm:mt-4 sm:gap-4 lg:grid-cols-4" aria-label="Pagamentos não confirmados">
        <StatCard label="Pagamentos pendentes" value={<span data-testid="kpi-pending">{k.pendingCount}</span>} sub={`${m(k.pendingCents)} · não contam como venda`} />
        <StatCard label="Pagamentos falhados" value={<span data-testid="kpi-failed">{k.failedCount}</span>} sub={`${m(k.failedCents)} · ${k.canceledCount} cancelado(s)/expirado(s)`} />
        <StatCard label="Nº de reembolsos" value={k.refundCount} />
        <StatCard label="Taxas registadas" value={m(k.feeCents)} hint="Só as taxas devolvidas pelo gateway em cada pagamento. Comissões não reportadas não estão incluídas." />
      </section>

      <div className="mt-4 rounded-[var(--radius-lg)] border border-line bg-surface-2/60 px-4 py-3 text-[12.5px] leading-relaxed text-muted" data-testid="finance-disclaimer">
        <b className="text-fg">Faturamento não é lucro nem saldo disponível.</b> O faturamento é o valor das vendas confirmadas. O lucro exigiria custos, impostos e comissões que a plataforma não conhece, e o saldo disponível é o que o gateway (EPay/E2Payments) mostra no respetivo painel após as liquidações. Por isso nenhum destes dois valores é calculado aqui.
      </div>

      {/* Gráficos */}
      <Card className="mt-6">
        <CardHeader title="Evolução do faturamento" description="Faturamento bruto por dia de confirmação do pagamento" />
        <CardBody className="pl-2 sm:pl-3">
          {k.salesCount === 0 && fin.daily.every((d) => d.grossCents === 0) ? <p className="py-20 text-center text-sm text-subtle">Sem vendas confirmadas no período.</p> : <GrossChart data={fin.daily} currency={c} />}
        </CardBody>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Vendas por dia" description="Número de vendas confirmadas" />
          <CardBody className="pl-2 sm:pl-3">
            {fin.daily.every((d) => d.sales === 0) ? <p className="py-16 text-center text-sm text-subtle">Sem vendas confirmadas no período.</p> : <DailyBars data={fin.daily} dataKey="sales" label="Vendas confirmadas" currency={c} testId="chart-sales" />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Evolução dos reembolsos" description="Valor reembolsado por dia de registo" />
          <CardBody className="pl-2 sm:pl-3">
            {k.refundCount === 0 ? <p className="py-16 text-center text-sm text-subtle">Sem reembolsos no período.</p> : <DailyBars data={fin.daily} dataKey="refundCents" label="Reembolsado" color={REFUND_COLOR} money currency={c} testId="chart-refunds" />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Vendas por produto" description="Faturamento bruto e unidades vendidas" />
          <CardBody>
            <BarList items={fin.products.slice(0, 8).map((x) => ({ key: x.productId, label: x.name, value: x.revenueCents, display: m(x.revenueCents), sub: `${x.units} un.` }))} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Distribuição por gateway" description="Faturamento bruto confirmado por cada gateway" />
          <CardBody>
            <div data-testid="gateway-breakdown">
              <BarList
                items={fin.gateways.map((g) => ({
                  key: g.gateway,
                  label: gatewayLabel(g.gateway),
                  value: g.revenueCents,
                  display: m(g.revenueCents),
                  sub: `${g.sales} venda(s) · ${gatewayTotal ? Math.round((g.revenueCents / gatewayTotal) * 1000) / 10 : 0}%`,
                }))}
              />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Transações */}
      <Card className="mt-6 scroll-mt-6" id="transacoes">
        <CardHeader title="Transações" description="Pedidos criados, confirmados ou reembolsados no período" action={<span className="text-[12.5px] text-subtle">{tx.total} resultado(s)</span>} />
        <form method="get" action="/relatorios#transacoes" className="flex flex-wrap items-end gap-2 border-b border-line px-5 py-3" data-testid="tx-filters">
          {(["range", "from", "to", "currency"] as const).map((h) => (sp[h] ? <input key={h} type="hidden" name={h} value={sp[h]} /> : null))}
          <label className="relative min-w-[200px] flex-1">
            <span className="sr-only">Pesquisar</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input name="q" defaultValue={filters.q ?? ""} placeholder="Pedido, referência, cliente ou produto" className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-surface-2 pl-9 pr-3 text-[13px] text-fg placeholder:text-subtle" data-testid="tx-search" />
          </label>
          <select name="estado" defaultValue={filters.status ?? ""} aria-label="Estado" className="h-9 rounded-[var(--radius-md)] border border-line bg-surface-2 px-2.5 text-[13px] text-fg" data-testid="tx-status">
            <option value="">Todos os estados</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{ORDER_STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select name="gateway" defaultValue={filters.gateway ?? ""} aria-label="Gateway" className="h-9 rounded-[var(--radius-md)] border border-line bg-surface-2 px-2.5 text-[13px] text-fg" data-testid="tx-gateway">
            <option value="">Todos os gateways</option>
            {opts.gateways.map((g) => (
              <option key={g} value={g}>{gatewayLabel(g)}</option>
            ))}
            <option value="sem-gateway">{gatewayLabel(null)}</option>
          </select>
          <select name="produto" defaultValue={filters.productId ?? ""} aria-label="Produto" className="h-9 max-w-[220px] rounded-[var(--radius-md)] border border-line bg-surface-2 px-2.5 text-[13px] text-fg">
            <option value="">Todos os produtos</option>
            {opts.products.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
          <button type="submit" className="h-9 rounded-[var(--radius-md)] bg-surface-3 px-4 text-[13px] font-medium text-fg hover:bg-surface-hover" data-testid="tx-apply">
            Filtrar
          </button>
          {hasFilters && (
            <Link href={`/relatorios?${qs({ q: undefined, estado: undefined, gateway: undefined, produto: undefined, page: undefined })}#transacoes`} className="h-9 px-2 text-[13px] leading-9 text-muted hover:text-fg">
              Limpar
            </Link>
          )}
        </form>
        <div className="flex gap-3 px-5 pt-3 text-[12px] text-subtle md:hidden">
          Ordenar:
          <Link href={sortHref("date")} className={cn("inline-flex items-center gap-1", filters.sort === "date" && "text-fg")}>Data <SortIcon k="date" /></Link>
          <Link href={sortHref("amount")} className={cn("inline-flex items-center gap-1", filters.sort === "amount" && "text-fg")}>Valor <SortIcon k="amount" /></Link>
        </div>
        <div data-testid="tx-table">
          <DataTable
            rows={tx.rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "date", header: <Link href={sortHref("date")} className="inline-flex items-center gap-1 hover:text-fg">Data <SortIcon k="date" /></Link>, mobile: "meta", cell: (r) => <span className="whitespace-nowrap tabular text-muted">{formatDate(r.date, tz, true)}</span> },
              { key: "code", header: "Pedido", mobile: "title", cell: (r) => <Link href={`/pedidos/${r.id}`} className="whitespace-nowrap font-mono text-[12.5px] font-medium hover:text-accent">{r.code}</Link> },
              { key: "product", header: "Produto", mobile: "meta", cell: (r) => <span className="block max-w-[180px] truncate text-muted" title={r.products}>{r.products || "—"}</span> },
              { key: "amount", header: <Link href={sortHref("amount")} className="inline-flex items-center gap-1 hover:text-fg">Valor <SortIcon k="amount" /></Link>, align: "right", mobile: "end", cell: (r) => <span className="whitespace-nowrap font-medium tabular">{formatMoney(r.totalCents, r.currency)}</span> },
              { key: "currency", header: "Moeda", mobile: "hide", cell: (r) => <span className="text-muted">{r.currency}</span> },
              { key: "status", header: "Estado", mobile: "end", cell: (r) => <span className="inline-flex flex-wrap items-center gap-1"><OrderStatusBadge status={r.status} />{r.isTestPayment && <Badge tone="warning">Teste</Badge>}</span> },
              { key: "gateway", header: "Gateway", mobile: "meta", cell: (r) => <span className="whitespace-nowrap text-muted">{gatewayLabel(r.gateway)}</span> },
              { key: "ref", header: "Referência", mobile: "hide", cell: (r) => <span className="block max-w-[130px] truncate font-mono text-[11.5px] text-subtle" title={r.reference ?? undefined}>{r.reference ?? "—"}</span> },
              {
                key: "refund",
                header: "Reembolso",
                mobile: "meta",
                cell: (r) =>
                  r.refundState === "none" ? <span className="text-subtle">—</span> : <span className="whitespace-nowrap text-info">{r.refundState === "full" ? "Total" : "Parcial"} · {formatMoney(r.refundedCents, r.currency)}</span>,
              },
            ]}
            empty={<EmptyState icon={BarChart3} title="Sem transações" description={hasFilters ? "Nenhuma transação corresponde aos filtros." : "Não há pedidos neste período."} />}
          />
        </div>
        <Pagination page={tx.page} pages={tx.pages} total={tx.total} makeHref={(n) => `/relatorios?${qs({ page: String(n) })}#transacoes`} />
      </Card>

      {/* Desempenho de checkouts e funis (mantido) */}
      <Card className="mt-6">
        <CardHeader title="Desempenho dos checkouts" description="Conversão = pedidos aprovados ÷ sessões × 100 (apenas quando existem sessões)" />
        <DataTable
          rows={legacy.checkoutRows}
          rowKey={(r) => r.id}
          columns={[
            { key: "name", header: "Checkout", mobile: "title", cell: (r) => <Link href={`/checkouts/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link> },
            { key: "sessions", header: "Sessões", align: "right", cell: (r) => <span className="tabular text-muted">{r.sessions}</span> },
            { key: "submits", header: "Submissões", align: "right", cell: (r) => <span className="tabular text-muted">{r.submits}</span> },
            { key: "approved", header: "Aprovados", align: "right", cell: (r) => <span className="tabular text-muted">{r.approved}</span> },
            { key: "revenue", header: "Faturação", align: "right", mobile: "end", cell: (r) => <span className="font-medium tabular">{formatMoney(r.revenueCents, legacy.currency)}</span> },
            { key: "conv", header: "Conversão", align: "right", mobile: "end", cell: (r) => <span className="tabular">{pct(r.conversion)}</span> },
          ]}
          empty={<p className="p-5 text-sm text-subtle">Sem checkouts.</p>}
        />
      </Card>

      <Card className="mt-6">
        <CardHeader title="Funis, upsells e downsells" description="Visualizações e decisões registadas nas etapas de oferta" />
        <DataTable
          rows={legacy.funnelRows}
          rowKey={(r) => r.id}
          columns={[
            { key: "name", header: "Funil", mobile: "title", cell: (r) => <Link href={`/funis/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link> },
            { key: "views", header: "Visualizações de ofertas", align: "right", cell: (r) => <span className="tabular text-muted">{r.views}</span> },
            { key: "accepts", header: "Aceites", align: "right", cell: (r) => <span className="tabular text-success">{r.accepts}</span> },
            { key: "declines", header: "Recusas", align: "right", cell: (r) => <span className="tabular text-danger">{r.declines}</span> },
            { key: "rate", header: "Taxa de aceitação", align: "right", mobile: "end", cell: (r) => <span className="tabular">{pct(r.acceptRate)}</span> },
          ]}
          empty={<p className="p-5 text-sm text-subtle">Sem funis.</p>}
        />
      </Card>

      <Card className="mt-6">
        <CardHeader title="Como os valores são calculados" />
        <CardBody>
          <ul className="grid gap-2 text-[13px] leading-relaxed text-muted">
            {[
              "Venda confirmada: pedido cujo pagamento foi confirmado no servidor pelo gateway (aviso assinado, consulta oficial ou resposta do pagamento). Voltar à página de sucesso não conta. Cada pedido conta uma vez, mesmo que o gateway envie a confirmação várias vezes.",
              "Faturamento bruto: soma dos pedidos confirmados no período, já com descontos, pela data de confirmação. Pendentes, falhados e cancelados nunca entram.",
              "Reembolsos: parciais ou totais, contados na data em que foram registados. Um pedido reembolsado continua a contar como venda no dia em que foi pago; o reembolso é subtraído no dia em que aconteceu.",
              `Períodos: cada dia vai das 00:00 às 23:59 no fuso horário da plataforma (${tz}). "Hoje" e "Este mês" incluem o dia atual até ao momento.`,
              "Moedas: valores em moedas diferentes nunca são somados; escolha a moeda quando existir mais de uma.",
              "Pagamentos com credenciais de teste do gateway e dados de demonstração ficam fora dos relatórios reais.",
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </>
  );
}
