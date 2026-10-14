import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOwner } from "@/server/auth/session";
import { getUserDetail } from "@/server/services/admin";
import { NotFoundError } from "@/server/services/products";
import { STATE_LABELS } from "@/server/auth/policy";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AccountBadge, AdminNav, UserActions } from "@/components/admin/admin-ui";
import { ResetLinkButton } from "@/components/admin/reset-link-button";
import { adminResetLinkAction } from "../../actions";

export const metadata: Metadata = { title: "Conta" };

const ACTION_LABEL: Record<string, string> = { approve: "Aprovada", reject: "Rejeitada", ban: "Suspensa", unban: "Suspensão levantada", password_reset_link: "Link de redefinição de palavra-passe gerado" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-all text-right text-fg">{children}</dd>
    </div>
  );
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireOwner();
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/i.test(id)) notFound();
  const d = await getUserDetail(actor, id).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const u = d.user;
  const tz = "Africa/Maputo";
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Administração", href: "/admin" }, { label: "Utilizadores", href: "/admin/utilizadores" }, { label: u.name }]}
        title={<span className="flex flex-wrap items-center gap-3">{u.name} {u.role === "OWNER" ? <Badge tone="accent">Proprietário</Badge> : <AccountBadge state={d.state} />}</span>}
        description={u.email}
        actions={<UserActions user={u} state={d.state} />}
      />
      <AdminNav current="/admin/utilizadores" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Dados da conta" />
          <CardBody className="py-2">
            <dl className="divide-y divide-line/60" data-testid="admin-user-detail">
              <Row label="Estado">{u.role === "OWNER" ? "Proprietário" : STATE_LABELS[d.state]}</Row>
              <Row label="Registo">{formatDate(u.createdAt, tz, true)}</Row>
              <Row label="Aprovada em">{u.approvedAt ? formatDate(u.approvedAt, tz, true) : "—"}</Row>
              <Row label="Rejeitada em">{u.rejectedAt ? formatDate(u.rejectedAt, tz, true) : "—"}</Row>
              <Row label="Suspensa desde">{u.bannedAt ? formatDate(u.bannedAt, tz, true) : "—"}</Row>
              <Row label="Último acesso">{u.lastLoginAt ? formatDate(u.lastLoginAt, tz, true) : "—"}</Row>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Palavra-passe" description="Recuperação de acesso" />
          <CardBody>
            <ResetLinkButton action={adminResetLinkAction.bind(null, u.id)} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Atividade" description="Apenas contagens (dados reais, sem demonstração)" />
          <CardBody className="py-2">
            <dl className="divide-y divide-line/60">
              <Row label="Produtos">{d.counts.products}</Row>
              <Row label="Checkouts">{d.counts.checkouts}</Row>
              <Row label="Funis">{d.counts.funnels}</Row>
              <Row label="Pedidos">{d.counts.orders}</Row>
              <Row label="Pedidos pagos">{d.counts.paidOrders}</Row>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Integrações de pagamento" description="Só o estado — as credenciais nunca são mostradas" />
          <CardBody>
            <ul className="grid gap-3" data-testid="admin-user-integrations">
              {d.integrations.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-fg">{g.name}</span>
                  <Badge tone={g.status === "active" ? "success" : g.status === "config_error" ? "danger" : g.status === "inactive" ? "neutral" : "warning"}>{g.statusLabel}</Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader title="Histórico administrativo" />
          <CardBody>
            {d.history.length === 0 ? (
              <p className="text-sm text-subtle">Sem ações registadas.</p>
            ) : (
              <ol className="grid gap-2 text-[13px]" data-testid="admin-history">
                {d.history.map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-x-3">
                    <span className="tabular text-subtle">{formatDate(h.createdAt, tz, true)}</span>
                    <span className="font-medium text-fg">{ACTION_LABEL[h.action] ?? h.action}</span>
                    <span className="text-muted">por {h.actor.email}</span>
                    {h.reason && <span className="text-muted">· {h.reason}</span>}
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
