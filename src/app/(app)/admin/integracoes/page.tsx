import type { Metadata } from "next";
import Link from "next/link";
import { KeyRound, Search, ShieldCheck, Users } from "lucide-react";
import { requireOwner } from "@/server/auth/session";
import { adminGatewayAvailability, getGrantableUser, listGrantsForAdmin, searchGrantableUsers } from "@/server/services/credential-grants";
import { getSettings } from "@/server/services/settings";
import { PROVIDER_CATALOG } from "@/server/payments/types";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DataTable } from "@/components/ui/data-table";
import { ActionButton } from "@/components/ui/action-button";
import { AdminNav } from "@/components/admin/admin-ui";
import { GrantForm } from "@/components/admin/grant-form";
import { grantCredentialsAction, revokeGrantAction } from "../actions";

export const metadata: Metadata = { title: "Partilhar credenciais de pagamento" };
export const dynamic = "force-dynamic";

export default async function AdminSharedCredentialsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireOwner();
  const sp = await searchParams;
  const q = sp.q?.slice(0, 100) ?? "";
  const [users, selected, grants, availability, settings] = await Promise.all([
    searchGrantableUsers(actor, q),
    sp.utilizador ? getGrantableUser(actor, sp.utilizador.slice(0, 40)) : Promise.resolve(null),
    listGrantsForAdmin(actor),
    adminGatewayAvailability(actor.id),
    getSettings(actor.id),
  ]);
  const tz = settings.timezone;
  const activeFor = (userId: string) => new Set(grants.filter((g) => g.grantee.id === userId && g.status === "ACTIVE").map((g) => g.provider));
  const selectHref = (id: string) => `/admin/integracoes?${new URLSearchParams({ ...(q ? { q } : {}), utilizador: id })}`;
  const requests = grants.filter((g) => g.status === "ACTIVE" && g.removalRequestedAt).length;

  return (
    <>
      <PageHeader
        title="Partilhar acesso às minhas credenciais de pagamento"
        description="Autorize um utilizador a cobrar os seus próprios produtos com a sua EPay ou E2Payments. As credenciais nunca lhe são mostradas e as vendas ficam na conta dele."
        breadcrumbs={[{ label: "Administração", href: "/admin" }, { label: "Integrações partilhadas" }]}
      />
      <AdminNav current="/admin/integracoes" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Utilizadores" description="Contas aprovadas. Pesquise por nome, email ou identificação." />
          <form className="flex gap-2 border-b border-line px-5 py-3" action="/admin/integracoes">
            <label htmlFor="grant-q" className="sr-only">Pesquisar utilizadores</label>
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
              <input id="grant-q" name="q" defaultValue={q} placeholder="Nome, email ou identificação" className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-surface-2 pl-9 pr-3 text-base text-fg sm:text-sm" data-testid="grant-search" />
            </div>
            <button type="submit" className="h-10 shrink-0 rounded-[var(--radius-md)] border border-line bg-surface-3 px-4 text-[13px] font-medium text-fg hover:bg-surface-hover">
              Pesquisar
            </button>
          </form>
          {users.length === 0 ? (
            <EmptyState icon={Users} title={q ? "Nenhum utilizador encontrado" : "Ainda não há utilizadores aprovados"} />
          ) : (
            <ul className="divide-y divide-line" data-testid="grant-users">
              {users.map((u) => (
                <li key={u.id}>
                  <Link
                    href={selectHref(u.id)}
                    aria-current={selected?.id === u.id ? "true" : undefined}
                    className={cn("flex min-h-14 items-center gap-3 px-5 py-2.5 hover:bg-surface-2", selected?.id === u.id && "bg-surface-2")}
                    data-testid="grant-user"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium text-fg">{u.name}</span>
                      <span className="block truncate text-[12.5px] text-muted">{u.email}</span>
                    </span>
                    {activeFor(u.id).size > 0 && <Badge tone="accent">{[...activeFor(u.id)].map((p) => (p === "epay" ? "EPay" : "E2Payments")).join(" · ")}</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="lg:col-span-2" data-testid="grant-panel">
          <CardHeader title="Conceder acesso" />
          <CardBody>
            {selected ? (
              <>
                <div className="mb-4 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 py-2.5">
                  <p className="text-[13.5px] font-semibold text-fg" data-testid="grant-selected-name">{selected.name}</p>
                  <p className="text-[12.5px] text-muted [overflow-wrap:anywhere]">{selected.email}</p>
                </div>
                <GrantForm
                  userId={selected.id}
                  action={grantCredentialsAction}
                  gateways={PROVIDER_CATALOG.map((p) => ({ id: p.id, name: p.name, adminActive: availability[p.id], alreadyActive: activeFor(selected.id).has(p.id) }))}
                />
                <p className="mt-4 flex items-start gap-2 text-[12px] text-subtle">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />O utilizador vê apenas o estado do método. Chaves, tokens e segredos ficam só no servidor; não há levantamentos nem acesso ao seu saldo.
                </p>
              </>
            ) : (
              <EmptyState icon={KeyRound} title="Escolha um utilizador" description="Selecione um utilizador na lista para escolher os métodos de pagamento a partilhar." />
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-6" data-testid="grants-list">
        <CardHeader title="Permissões concedidas" description={requests ? `${requests} pedido(s) de remoção por tratar` : "Revogue individualmente quando quiser. Pagamentos já iniciados continuam a ser confirmados."} />
        <DataTable
          rows={grants}
          rowKey={(g) => g.id}
          columns={[
            {
              key: "user",
              header: "Utilizador",
              mobile: "title",
              cell: (g) => (
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-fg">{g.grantee.name}</span>
                  <span className="truncate text-[12px] text-muted">{g.grantee.email}</span>
                </span>
              ),
            },
            { key: "method", header: "Método", cell: (g) => <span className="text-fg">{g.providerName}</span> },
            {
              key: "status",
              header: "Estado",
              mobile: "end",
              cell: (g) => (
                <span className="flex flex-wrap items-center gap-1.5" data-testid="grant-status">
                  <Badge tone={g.status === "ACTIVE" ? "success" : "neutral"} dot>
                    {g.status === "ACTIVE" ? "Ativa" : "Revogada"}
                  </Badge>
                  {g.status === "ACTIVE" && g.removalRequestedAt && <Badge tone="warning">Remoção solicitada</Badge>}
                </span>
              ),
            },
            {
              key: "dates",
              header: "Datas",
              cell: (g) => (
                <span className="flex flex-col text-[12px] text-muted tabular">
                  <span>Concedida {formatDate(g.grantedAt, tz, true)}</span>
                  {g.revokedAt && <span>Revogada {formatDate(g.revokedAt, tz, true)}</span>}
                  {g.removalRequestedAt && g.status === "ACTIVE" && <span>Pedido {formatDate(g.removalRequestedAt, tz, true)}</span>}
                </span>
              ),
            },
            {
              key: "actions",
              header: "",
              mobile: "action",
              align: "right",
              cell: (g) =>
                g.status === "ACTIVE" ? (
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    action={revokeGrantAction.bind(null, g.id)}
                    confirm={{ title: `Revogar ${g.providerName} de ${g.grantee.name}`, description: "Novos pagamentos deste utilizador deixam de usar as suas credenciais. Pagamentos já iniciados continuam a ser confirmados. As outras autorizações não mudam.", confirmLabel: "Revogar acesso", danger: true }}
                    data-testid="grant-revoke"
                  >
                    Revogar
                  </ActionButton>
                ) : null,
            },
          ]}
          empty={<EmptyState icon={KeyRound} title="Ainda não concedeu acesso a ninguém" />}
        />
      </Card>
    </>
  );
}
