import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { requireOwner } from "@/server/auth/session";
import { adminOverview } from "@/server/services/admin";
import { accountState } from "@/server/auth/policy";
import { getSystemHealth } from "@/server/health";
import { getPaymentHealth } from "@/server/services/payment-health";
import { getVapidKeys } from "@/server/notifications/push";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { DataTable } from "@/components/ui/data-table";
import { AccountBadge, AdminNav } from "@/components/admin/admin-ui";

export const metadata: Metadata = { title: "Administração da Plataforma" };

export default async function AdminOverviewPage() {
  const actor = await requireOwner();
  const [o, health, vapid, pay] = await Promise.all([adminOverview(actor), getSystemHealth(), getVapidKeys().catch(() => null), getPaymentHealth()]);
  const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
  const status = [
    { label: "Base de dados", ok: health.ok, detail: health.ok ? "Ligada e migrada" : "Com problemas — ver /api/health" },
    { label: "Notificações push", ok: Boolean(vapid), detail: vapid ? "Chaves VAPID disponíveis" : "Sem chave de cifra no servidor" },
    { label: "Contas com EPay ativa", ok: true, detail: `${o.integrations.epayAccounts} conta(s)` },
    { label: "Contas com E2Payments verificada e ativa", ok: true, detail: `${o.integrations.e2Accounts} conta(s)` },
  ];
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-3"><ShieldCheck className="h-7 w-7 text-accent" aria-hidden="true" /> Administração da Plataforma</span>}
        description="Gestão de contas e estado geral. Os dados comerciais de cada conta (vendas, produtos, credenciais) não aparecem aqui."
      />
      <AdminNav current="/admin" />
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6" aria-label="Contas" data-testid="admin-stats">
        <StatCard highlight label="Contas registadas" value={<span data-testid="admin-total">{o.total}</span>} />
        <StatCard label="Pendentes" value={<Link href="/admin/utilizadores?estado=pending" className="hover:text-accent" data-testid="admin-pending">{o.pending}</Link>} />
        <StatCard label="Aprovadas" value={o.approved} />
        <StatCard label="Rejeitadas" value={o.rejected} />
        <StatCard label="Suspensas" value={o.banned} />
        <StatCard label="Ativas (30 dias)" value={o.active} hint="Contas aprovadas que iniciaram sessão nos últimos 30 dias." />
      </section>

      <Card className="mt-6" data-testid="payment-health">
        <CardHeader
          title="Saúde dos pagamentos (última hora)"
          description="Métricas técnicas de toda a plataforma, sem valores nem dados comerciais das contas. Atualiza ao recarregar a página."
        />
        <CardBody className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            <StatCard label="Tentativas" value={<span data-testid="ph-attempts">{pay.attempts}</span>} hint="Pagamentos iniciados na última hora." />
            <StatCard label="Pico / minuto" value={pay.peakPerMinute} />
            <StatCard label="Aprovação" value={<span data-testid="ph-approval">{pct(pay.approvalRate)}</span>} hint="Pagos ÷ (pagos + falhados + cancelados)." />
            <StatCard label="Falhas" value={pct(pay.failureRate)} />
            <StatCard label="Pendentes agora" value={pay.pending} />
            <StatCard label="Pendentes > 10 min" value={<span className={pay.stuckPending ? "text-warning" : ""}>{pay.stuckPending}</span>} hint="À espera de aviso ou consulta do gateway (a reconciliação automática verifica-os)." />
            <StatCard label="Avisos atrasados" value={<span className={pay.webhooksDelayed ? "text-warning" : ""}>{pay.webhooksDelayed}</span>} hint={`Recebidos e por processar há mais de 1 min · falhados: ${pay.webhooksFailed}${pay.webhookAvgProcessMs !== null ? ` · processamento médio ${pay.webhookAvgProcessMs} ms` : ""}`} />
            <StatCard label="Memória (instância)" value={`${pay.instance.rssMb} MB`} hint={`Heap ${pay.instance.heapUsedMb} MB · ativa há ${pay.instance.uptimeMin} min. Cada instância da Vercel é independente.`} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-subtle">Tempo de resposta dos gateways</p>
              {pay.latency.length ? (
                <ul className="grid gap-1.5 text-sm" data-testid="ph-latency">
                  {pay.latency.map((l) => (
                    <li key={l.provider} className="flex justify-between gap-3">
                      <span>{l.provider}</span>
                      <span className="tabular text-muted">média {l.avgMs} ms · p95 {l.p95Ms} ms · {l.count} pedido(s)</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-subtle">Sem pagamentos na última hora.</p>
              )}
            </div>
            <div>
              <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-subtle">Erros dos gateways</p>
              {pay.gatewayErrors.length ? (
                <ul className="grid gap-1.5 text-sm">
                  {pay.gatewayErrors.map((g) => (
                    <li key={g.provider} className="flex justify-between gap-3">
                      <span>{g.provider}</span>
                      <span className="tabular text-warning">{g.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-subtle">Nenhum erro na última hora.</p>
              )}
            </div>
          </div>
          {pay.perMinute.length > 0 && (
            <div aria-label="Tentativas por minuto" className="flex h-16 items-end gap-[2px]">
              {pay.perMinute.map((m) => (
                <span key={m.minute} title={`${new Date(m.minute).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Maputo" })}: ${m.attempts}`} className="min-w-[3px] flex-1 rounded-t bg-accent/70" style={{ height: `${Math.max(6, (m.attempts / Math.max(1, pay.peakPerMinute)) * 100)}%` }} />
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Registos recentes" action={<Link href="/admin/utilizadores" className="-my-1.5 inline-flex min-h-8 items-center py-1.5 text-[13px] text-muted hover:text-fg">Ver todos →</Link>} />
          <DataTable
            rows={o.recent}
            rowKey={(r) => r.id}
            columns={[
              { key: "name", header: "Nome", mobile: "title", cell: (r) => <Link href={`/admin/utilizadores/${r.id}`} className="font-medium hover:text-accent">{r.name}</Link> },
              { key: "email", header: "Email", mobile: "meta", cell: (r) => <span className="text-muted">{r.email}</span> },
              { key: "date", header: "Registo", mobile: "meta", className: "hidden xl:table-cell", cell: (r) => <span className="whitespace-nowrap tabular text-muted">{formatDate(r.createdAt, "Africa/Maputo", true)}</span> },
              { key: "state", header: "Estado", align: "right", mobile: "end", cell: (r) => (r.role === "OWNER" ? <span className="text-[12px] text-subtle">Proprietário</span> : <AccountBadge state={accountState(r)} />) },
            ]}
            empty={<p className="p-5 text-sm text-subtle">Sem registos.</p>}
          />
        </Card>
        <Card>
          <CardHeader title="Estado geral da plataforma" />
          <CardBody>
            <ul className="grid gap-3" data-testid="platform-status">
              {status.map((s) => (
                <li key={s.label} className="flex items-start gap-2.5 text-sm">
                  {s.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />}
                  <span>
                    <span className="block font-medium text-fg">{s.label}</span>
                    <span className="block text-[12.5px] text-muted">{s.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
