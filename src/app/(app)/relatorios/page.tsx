import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Info } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getReportsData } from "@/server/services/metrics";
import { resolveRange } from "@/lib/dates";
import { CURRENCIES, formatMoney, type CurrencyCode } from "@/lib/money";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DemoBadge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RangeFilter } from "@/components/filters/range-filter";
import { BarList } from "@/components/charts/bar-list";
import { RevenueChart } from "@/components/charts/charts";

export const metadata: Metadata = { title: "Relatórios" };

const KIND_LABEL = { MAIN: "Produto principal", ORDER_BUMP: "Oferta adicional", UPSELL: "Upsell", DOWNSELL: "Downsell" } as const;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireUser();
  const sp = await searchParams;
  const { isDemo, settings } = await getScope();
  const tz = settings.timezone;
  const range = resolveRange({ preset: sp.range, from: sp.from, to: sp.to }, tz);
  const cur = CURRENCIES.includes(sp.currency as CurrencyCode) ? (sp.currency as CurrencyCode) : undefined;
  const d = await getReportsData({ isDemo, range, currency: cur, defaultCurrency: settings.defaultCurrency, tz });
  const m = (c: number) => formatMoney(c, d.currency);
  const k = d.kpis;
  const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("pt-BR")}%`);

  return (
    <>
      <PageHeader title={<span className="flex flex-wrap items-center gap-3">Relatórios {isDemo && <DemoBadge />}</span>} description={`${range.label} · ${d.currency}`} />
      <div className="mb-6">
        <RangeFilter preset={range.preset} from={sp.from} to={sp.to} currencies={d.currencies.length > 1 ? d.currencies : undefined} currency={d.currency} />
      </div>

      {!d.hasAnyOrder ? (
        <Card>
          <EmptyState icon={BarChart3} title="Sem dados para relatórios" description="Os relatórios são calculados a partir de pedidos e sessões de checkout persistidos. Ainda não existem registos neste modo." />
        </Card>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            <StatCard highlight label="Faturação bruta" value={m(k.grossCents)} />
            <StatCard label="Pedidos aprovados" value={k.approvedCount} sub={`${k.totalOrders} no total`} />
            <StatCard label="Ticket médio" value={k.avgTicketCents === null ? "—" : m(k.avgTicketCents)} />
            <StatCard label="Conversão" value={pct(k.conversionRate)} sub={k.conversionRate === null ? "Sem sessões registadas" : `${k.checkoutSessions} sessões`} />
            <StatCard label="Reembolsos" value={`${k.refundCount} · ${m(k.refundCents)}`} />
          </section>

          <Card className="mt-6">
            <CardHeader title="Faturação no período" description="Comparada com o período anterior de igual duração" />
            <CardBody className="pl-2 sm:pl-3">
              <RevenueChart data={d.series} currency={d.currency} />
            </CardBody>
          </Card>

          <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Produtos mais vendidos" />
              <CardBody>
                <BarList items={d.products.map((p) => ({ key: p.productId, label: p.name, value: p.revenueCents, display: m(p.revenueCents), sub: `${p.units} un.` }))} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Composição da faturação" description="Por tipo de item em pedidos aprovados" />
              <CardBody>
                <BarList items={d.offerItems.map((o) => ({ key: o.kind, label: KIND_LABEL[o.kind], value: o.revenueCents, display: m(o.revenueCents), sub: `${o.count} itens` }))} />
              </CardBody>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader title="Desempenho dos checkouts" description="Conversão = pedidos aprovados ÷ sessões × 100 (apenas quando existem sessões)" />
            <DataTable
              rows={d.checkoutRows}
              rowKey={(r) => r.id}
              columns={[
                { key: "name", header: "Checkout", mobile: "title", cell: (r) => <Link href={`/checkouts/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link> },
                { key: "sessions", header: "Sessões", align: "right", cell: (r) => <span className="tabular text-muted">{r.sessions}</span> },
                { key: "submits", header: "Submissões", align: "right", cell: (r) => <span className="tabular text-muted">{r.submits}</span> },
                { key: "approved", header: "Aprovados", align: "right", cell: (r) => <span className="tabular text-muted">{r.approved}</span> },
                { key: "revenue", header: "Faturação", align: "right", mobile: "end", cell: (r) => <span className="font-medium tabular">{m(r.revenueCents)}</span> },
                { key: "conv", header: "Conversão", align: "right", mobile: "end", cell: (r) => <span className="tabular">{pct(r.conversion)}</span> },
              ]}
              empty={<p className="p-5 text-sm text-subtle">Sem checkouts.</p>}
            />
          </Card>

          <Card className="mt-6">
            <CardHeader title="Funis, upsells e downsells" description="Visualizações e decisões registadas nas etapas de oferta" />
            <DataTable
              rows={d.funnelRows}
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
        </>
      )}

      <Card className="mt-6">
        <CardHeader title="Definições e limitações" />
        <CardBody>
          <ul className="grid gap-2 text-[13px] leading-relaxed text-muted">
            {[
              "Faturação bruta: soma dos pedidos aprovados criados no período, após descontos. Pendentes, recusados, cancelados e reembolsados não entram.",
              "Reembolsos: apresentados à parte; um pedido reembolsado deixa de estar aprovado e por isso não é subtraído duas vezes.",
              "Valor líquido: faturação bruta menos taxas efetivamente registadas. Sem processador integrado, não existem taxas registadas e nenhum custo é estimado.",
              "Conversão: só é calculada quando existem sessões de checkout registadas no período. Sem sessões, mostra “—”.",
              "Moedas: valores em moedas diferentes nunca são somados; selecione a moeda quando existir mais de uma.",
              isDemo ? "Modo de demonstração: todos os valores são fictícios e isolados dos dados reais." : "Funis: aceitações reais dependerão de eventos confirmados pelo futuro processador de pagamentos.",
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
