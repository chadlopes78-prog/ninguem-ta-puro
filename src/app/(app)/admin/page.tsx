import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import { requireOwner } from "@/server/auth/session";
import { adminOverview } from "@/server/services/admin";
import { accountState } from "@/server/auth/policy";
import { getSystemHealth } from "@/server/health";
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
  const [o, health, vapid] = await Promise.all([adminOverview(actor), getSystemHealth(), getVapidKeys().catch(() => null)]);
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
