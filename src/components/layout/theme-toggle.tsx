"use client";

import { useEffect, useState, useTransition } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_COOKIE, type PanelTheme } from "@/lib/panel-theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: PanelTheme; label: string; icon: React.ElementType }[] = [
  { value: "light", label: "Modo claro", icon: Sun },
  { value: "dark", label: "Modo escuro", icon: Moon },
  { value: "system", label: "Igual ao sistema", icon: Monitor },
];

function apply(theme: PanelTheme) {
  document.documentElement.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}

/** Alterna o tema do painel sem recarregar a página; a preferência fica guardada na conta. */
export function ThemeToggle({ initial, save, compact }: { initial: PanelTheme; save: (t: string) => Promise<{ ok: boolean }>; compact?: boolean }) {
  const [theme, setTheme] = useState<PanelTheme>(initial);
  const [, start] = useTransition();
  // Sincroniza a página com a preferência guardada na conta (ex.: noutro dispositivo)
  useEffect(() => {
    if (document.documentElement.dataset.theme !== initial) apply(initial);
  }, [initial]);
  const choose = (t: PanelTheme) => {
    setTheme(t);
    apply(t);
    start(async () => {
      await save(t);
    });
  };
  if (compact) {
    const next: PanelTheme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    const Cur = OPTIONS.find((o) => o.value === theme)!.icon;
    return (
      <button type="button" onClick={() => choose(next)} className="grid h-8 w-8 place-items-center rounded-md text-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Tema: ${OPTIONS.find((o) => o.value === theme)!.label}. Mudar`} title="Mudar tema" data-testid="theme-toggle-compact">
        <Cur className="h-4 w-4" />
      </button>
    );
  }
  return (
    <div role="radiogroup" aria-label="Tema do painel" className="flex gap-0.5 rounded-[var(--radius-md)] border border-line bg-surface-2 p-0.5" data-testid="theme-toggle">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={theme === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => choose(o.value)}
          className={cn("grid h-7 flex-1 place-items-center rounded-[7px] transition-colors", theme === o.value ? "bg-surface text-fg shadow-sm" : "text-subtle hover:text-fg")}
          data-testid={`theme-${o.value}`}
        >
          <o.icon className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
