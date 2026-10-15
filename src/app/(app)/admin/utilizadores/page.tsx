import type { Metadata } from "next";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import { requireOwner } from "@/server/auth/session";
import { listUsers, USER_FILTERS, type UserFilter } from "@/server/services/admin";
import { accountState } from "@/server/auth/policy";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { AccountBadge, AdminNav, UserActions } from "@/components/admin/admin-ui";

export const metadata: Metadata = { title: "Utilizadores" };

const FILTER_LABELS: Record<UserFilter, string> = { all: "Todos", pending: "Pendentes", approved: "Aprovados", rejected: "Rejeitados", banned: "Banidos" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const actor = await requireOwner();
  const sp = await searchParams;
  const filter = USER_FILTERS.includes(sp.estado as UserFilter) ? (sp.estado as UserFilter) : "all";
  const q = sp.q?.slice(0, 100) ?? "";
  const page = Math.max(1, Number(sp.page) || 1);
  const list = await listUsers(actor, { filter, q, page });
  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ estado: filter === "all" ? undefined : filter, q: q || undefined, ...over }).filter(([, v]) => v) as [string, string][]);
    return `/admin/utilizadores${p.size ? `?${p}` : ""}`;
  };
  const navCurrent = filter === "pending" || filter === "approved" || filter === "banned" ? `/admin/utilizadores?estado=${filter}` : "/admin/utilizadores";
  return (
    <>
      <PageHeader title="Utilizadores" description="Aprovar, rejeitar, banir e desbanir contas. As ações que retiram acesso pedem confirmação." breadcrumbs={[{ label: "Administração", href: "/admin" }, { label: "Utilizadores" }]} />
      <AdminNav current={navCurrent} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <nav className="flex flex-wrap gap-1" aria-label="Filtrar por estado">
            {USER_FILTERS.map((f) => (
              <Link key={f} href={href({ estado: f === "all" ? undefined : f, page: undefined })} aria-current={filter === f ? "page" : undefined} className={cn("h-8 rounded-[7px] px-3 text-[13px] font-medium leading-8", filter === f ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")} data-testid={`filter-${f}`}>
                {FILTER_LABELS[f]}
              </Link>
            ))}
          </nav>
          <form method="get" action="/admin/utilizadores" className="relative ml-auto min-w-[220px] flex-1 sm:max-w-xs">
            {filter !== "all" && <input type="hidden" name="estado" value={filter} />}
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
            <input name="q" defaultValue={q} placeholder="Pesquisar por nome ou email" aria-label="Pesquisar por nome ou email" className="h-9 w-full rounded-[var(--radius-md)] border border-line bg-surface-2 pl-9 pr-3 text-[13px] text-fg placeholder:text-subtle" data-testid="admin-search" />
          </form>
        </div>
        <div data-testid="admin-users">
          <DataTable
            rows={list.rows}
            rowKey={(r) => r.id}
            columns={[
              { key: "name", header: "Nome", mobile: "title", cell: (r) => <Link href={`/admin/utilizadores/${r.id}`} className="font-medium hover:text-accent" data-testid="admin-user-link">{r.name}</Link> },
              { key: "email", header: "Email", mobile: "meta", cell: (r) => <span className="break-all text-muted">{r.email}</span> },
              { key: "created", header: "Registo", mobile: "meta", cell: (r) => <span className="whitespace-nowrap tabular text-muted"><span className="lg:hidden">Registo: </span>{formatDate(r.createdAt, "Africa/Maputo", true)}</span> },
              { key: "state", header: "Estado", mobile: "end", cell: (r) => (r.role === "OWNER" ? <span className="text-[12px] text-subtle">Proprietário</span> : <AccountBadge state={accountState(r)} />) },
              { key: "last", header: "Último acesso", mobile: "meta", className: "hidden xl:table-cell", cell: (r) => <span className="whitespace-nowrap tabular text-muted"><span className="lg:hidden">Último acesso: </span>{r.lastLoginAt ? formatDate(r.lastLoginAt, "Africa/Maputo", true) : "—"}</span> },
              { key: "actions", header: "Ações", mobile: "meta", cell: (r) => <UserActions user={r} state={accountState(r)} compact /> },
            ]}
            empty={<EmptyState icon={Users} title="Sem contas" description={q ? "Nenhuma conta corresponde à pesquisa." : "Não há contas neste estado."} />}
          />
        </div>
        <Pagination page={list.page} pages={list.pages} total={list.total} makeHref={(p) => href({ page: String(p) })} />
      </Card>
    </>
  );
}
