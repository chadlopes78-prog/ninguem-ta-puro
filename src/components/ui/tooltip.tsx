"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Dica acessível: abre com o rato (hover), com o teclado (foco) e com toque (o iPhone não dá foco a botões
 * ao tocar, por isso o toque alterna a dica). Fecha ao tocar fora ou com Escape. Nunca sai do ecrã.
 */
export function Tooltip({ content, children, className }: { content: string; children?: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const root = useRef<HTMLSpanElement>(null);
  const tip = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  // mantém a dica dentro do ecrã (ícones junto às margens, ecrãs estreitos)
  useLayoutEffect(() => {
    const t = tip.current;
    if (!t) return;
    const measure = () => {
      // mede na posição centrada (sem correção) e calcula o deslocamento necessário para caber no ecrã
      const prev = t.style.transform;
      t.style.transform = "translateX(-50%)";
      const r = t.getBoundingClientRect();
      t.style.transform = prev;
      const m = 8;
      setShift(r.left < m ? m - r.left : r.right > window.innerWidth - m ? window.innerWidth - m - r.right : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  return (
    <span ref={root} className={cn("group/tt relative inline-flex", className)} onMouseLeave={() => setOpen(false)}>
      {children ?? (
        <button
          type="button"
          // área de toque de 32 px sem alterar o tamanho visual do ícone
          className="relative text-subtle after:absolute after:-inset-[9px] after:content-[''] hover:text-fg"
          aria-label={content}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
      <span
        ref={tip}
        role="tooltip"
        style={{ transform: `translateX(calc(-50% + ${shift}px))` }}
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-[min(240px,calc(100vw-16px))] rounded-[var(--radius-sm)] border border-line-strong bg-surface-3 px-2.5 py-1.5 text-[12px] font-normal leading-snug text-fg shadow-[var(--shadow-pop)] transition-opacity",
          open ? "visible opacity-100" : "invisible opacity-0 group-focus-within/tt:visible group-focus-within/tt:opacity-100 group-hover/tt:visible group-hover/tt:opacity-100",
        )}
      >
        {content}
      </span>
    </span>
  );
}
