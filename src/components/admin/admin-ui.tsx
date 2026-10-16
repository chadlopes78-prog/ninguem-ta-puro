import Link from "next/link";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { STATE_LABELS, type AccountState } from "@/server/auth/policy";
import { adminUserAction } from "@/app/(app)/admin/actions";

const TONE = { pending: "warning", approved: "success", rejected: "danger", banned: "danger" } as const;

export function AccountBadge({ state }: { state: AccountState }) {
  return (
    <Badge tone={TONE[state]} dot>
      {STATE_LABELS[state]}
    </Badge>
  );
}

const LINKS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/utilizadores", label: "Utilizadores" },
  { href: "/admin/utilizadores?estado=pending", label: "Aprovações pendentes" },
  { href: "/admin/utilizadores?estado=approved", label: "Contas aprovadas" },
  { href: "/admin/utilizadores?estado=banned", label: "Contas suspensas" },
  { href: "/admin/integracoes", label: "Integrações partilhadas" },
];

export function AdminNav({ current }: { current: string }) {
  return (
    <nav className="mb-6 flex max-w-full flex-wrap gap-1.5" aria-label="Administração">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={current === l.href ? "page" : undefined}
          className={cn(
            "h-9 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium leading-9 transition-colors",
            current === l.href ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-muted hover:border-line-strong hover:text-fg",
          )}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Botões de ação de uma conta (com confirmação nas ações que retiram acesso). O servidor volta a validar tudo. */
export function UserActions({ user, state, compact }: { user: { id: string; name: string; role: string }; state: AccountState; compact?: boolean }) {
  if (user.role === "OWNER") return <span className="text-[12px] text-subtle">Proprietário</span>;
  const size = compact ? "sm" : "md";
  return (
    <div className="flex flex-wrap gap-2">
      {state === "pending" || state === "rejected" ? (
        <ActionButton size={size} action={adminUserAction.bind(null, user.id, "approve", undefined)} data-testid="admin-approve">
          Aprovar conta
        </ActionButton>
      ) : null}
      {state === "pending" ? (
        <ActionButton
          size={size}
          variant="secondary"
          action={adminUserAction.bind(null, user.id, "reject", undefined)}
          confirm={{ title: "Rejeitar candidatura", description: `${user.name} não terá acesso à plataforma. A conta não é apagada e pode ser aprovada mais tarde.`, confirmLabel: "Rejeitar conta", danger: true }}
          data-testid="admin-reject"
        >
          Rejeitar conta
        </ActionButton>
      ) : null}
      {state === "banned" ? (
        <ActionButton size={size} variant="secondary" action={adminUserAction.bind(null, user.id, "unban", undefined)} data-testid="admin-unban">
          Desbanir
        </ActionButton>
      ) : (
        <ActionButton
          size={size}
          variant="danger"
          action={adminUserAction.bind(null, user.id, "ban", undefined)}
          confirm={{ title: "Suspender conta", description: `${user.name} perde de imediato o acesso (as sessões ativas terminam) e os checkouts deixam de vender. Produtos, vendas e credenciais são mantidos.`, confirmLabel: "Suspender", danger: true }}
          data-testid="admin-ban"
        >
          Banir
        </ActionButton>
      )}
    </div>
  );
}
