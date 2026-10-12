"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { GROUP_LABELS, NAV } from "./nav";
import { Logo, LogoMark } from "./logo";

interface Props {
  user: { name: string; email: string };
  businessName: string;
  demoMode: boolean;
  logoutAction: () => Promise<void>;
  children: React.ReactNode;
}

const STORAGE_KEY = "ntp:sidebar-collapsed";

export function AppShell({ user, businessName, demoMode, logoutAction, children }: Props) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);
  useEffect(() => setMobileOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
  }, [mobileOpen]);

  const toggle = () => {
    setCollapsed((c) => {
      localStorage.setItem(STORAGE_KEY, c ? "0" : "1");
      return !c;
    });
  };

  const current = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));

  const nav = (isCollapsed: boolean) => (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4 scrollbar-thin" aria-label="Navegação principal">
      {(Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]).map((g) => (
        <div key={g}>
          {!isCollapsed && <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-subtle">{GROUP_LABELS[g]}</p>}
          <ul className="flex flex-col gap-0.5">
            {NAV.filter((n) => n.group === g).map((item) => {
              const active = item === current;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    title={isCollapsed ? item.label : undefined}
                    className={cn(
                      "group relative flex h-10 items-center gap-3 rounded-[var(--radius-md)] px-2.5 text-[13.5px] font-medium transition-colors",
                      active ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                      isCollapsed && "justify-center px-0",
                    )}
                  >
                    {active && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-accent" aria-hidden="true" />}
                    <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-accent" : "text-subtle group-hover:text-fg")} aria-hidden="true" />
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const account = (isCollapsed: boolean) => (
    <div className={cn("border-t border-line p-3", isCollapsed && "flex flex-col items-center gap-2")}>
      <div className={cn("flex items-center gap-2.5 rounded-[var(--radius-md)] px-1.5 py-1.5", isCollapsed && "justify-center px-0")}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-3 text-[12px] font-semibold text-fg" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        {!isCollapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
            <p className="truncate text-[11.5px] text-subtle">{user.email}</p>
          </div>
        )}
        <form action={logoutAction}>
          <button type="submit" className="grid h-8 w-8 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg" aria-label="Terminar sessão" title="Terminar sessão">
            <LogOut className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar desktop */}
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-line bg-[#0d0f12] transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-[248px]",
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-line px-4", collapsed && "justify-center px-0")}>
          <Link href="/dashboard" aria-label="Início">
            {collapsed ? <LogoMark /> : <Logo name={businessName} />}
          </Link>
        </div>
        {nav(collapsed)}
        <button
          onClick={toggle}
          className="mx-3 mb-2 flex h-9 items-center justify-center gap-2 rounded-[var(--radius-md)] text-[12.5px] text-subtle hover:bg-surface-2 hover:text-fg"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /> Recolher</>)}
        </button>
        {account(collapsed)}
      </aside>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade-in bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[min(300px,85vw)] animate-slide-up flex-col border-r border-line bg-[#0d0f12]">
            <div className="flex h-16 items-center justify-between border-b border-line px-4">
              <Logo name={businessName} />
              <button onClick={() => setMobileOpen(false)} className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2" aria-label="Fechar menu">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav(false)}
            {account(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {demoMode && (
          <div className="flex h-9 items-center justify-center gap-2 overflow-hidden border-b border-demo/30 bg-demo/10 px-4 text-center text-[12.5px] font-medium text-demo">
            <span className="font-semibold uppercase tracking-wide">Modo de demonstração</span>
            <span className="hidden text-demo/80 sm:inline">— a mostrar apenas dados fictícios, separados dos dados reais.</span>
            <Link href="/configuracoes#demo" className="underline underline-offset-2 hover:text-fg">
              Gerir
            </Link>
          </div>
        )}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setMobileOpen(true)} className="grid h-10 w-10 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <LogoMark className="h-7 w-7" />
          <span className="truncate font-display text-[15px] font-semibold">{current?.label ?? businessName}</span>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 has-[[data-testid=funnel-canvas]]:max-w-none px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
