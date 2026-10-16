"use client";
// Abas da área Operações (Pedidos, Clientes, Relatórios, Notificações). Cada aba é a rota que já existia,
// por isso recarregar a página mantém a aba e os links antigos continuam a funcionar.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { OPERATIONS_TABS } from "./nav";

export function OperationsTabs({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Abas de Operações" className="mb-6 grid w-full grid-cols-2 gap-1 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-1 sm:inline-flex sm:w-auto" data-testid="operations-tabs">
      {OPERATIONS_TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-[var(--radius-md)] px-3 text-[13.5px] font-medium sm:px-4", active ? "bg-surface-3 text-fg shadow-sm" : "text-muted hover:text-fg")}
            data-testid={`ops-tab-${t.key}`}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active && "text-accent")} aria-hidden="true" />
            <span>{t.label}</span>
            {t.key === "notificacoes" && unread > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[10.5px] font-bold text-accent-ink tabular" aria-label={`${unread} por ler`} data-testid="ops-unread-badge">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
