"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";

/**
 * Resposta imediata ao toque: uma barra fina no topo aparece logo que se toca num link interno que muda de página,
 * e desaparece quando a nova página chega. Mudanças só de filtros/pesquisa (mesmo caminho) não a ativam.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [active, setActive] = useState(false);

  useEffect(() => setActive(false), [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      setActive(true);
    };
    // fase de captura: o Link do Next.js cancela o clique nativo (preventDefault) antes da fase normal
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // segurança: nunca fica presa (ex.: navegação cancelada)
  useEffect(() => {
    if (!active) return;
    const t = setTimeout(() => setActive(false), 15_000);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;
  return (
    <div role="progressbar" aria-label="A carregar a página" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-accent/20" data-testid="nav-progress">
      <div className="h-full w-1/3 animate-nav-progress rounded-full bg-accent" />
    </div>
  );
}

/** Indicador dentro de um link do menu enquanto a página desse link está a carregar. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? <span className="ml-auto h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" /> : null;
}
