"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import type { ActionResult } from "@/server/validation/common";
import { cn } from "@/lib/utils";
import { useToast } from "./toast";
import { Modal } from "./modal";
import { Button } from "./button";

export type RowMenuItem =
  | { kind: "link"; label: string; href: string }
  | { kind: "action"; label: string; run: () => Promise<ActionResult<unknown>>; danger?: boolean; confirm?: string; success?: string };

export function RowMenu({ items, label = "Ações" }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<Extract<RowMenuItem, { kind: "action" }> | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  // posição fixa calculada a partir do botão: o menu nunca fica cortado por tabelas/cartões com deslocamento
  // próprio nem sai do ecrã (abre para cima quando não há espaço por baixo)
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: "hidden" });
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const place = () => {
      const b = btn.current?.getBoundingClientRect();
      const m = menu.current;
      if (!b || !m) return;
      const h = m.offsetHeight;
      const w = m.offsetWidth;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const below = vh - b.bottom;
      const top = below >= h + 8 || below >= b.top ? Math.min(b.bottom + 4, vh - h - 8) : Math.max(8, b.top - h - 4);
      const left = Math.min(Math.max(8, b.right - w), vw - w - 8);
      setPos({ position: "fixed", top: Math.max(8, top), left, visibility: "visible" });
    };
    place();
    // ao deslocar a página, o menu fecha (como nos menus nativos); ao redimensionar, reposiciona
    const onScroll = (e: Event) => !menu.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", onScroll, true);
      setPos({ visibility: "hidden" });
    };
  }, [open]);

  const exec = (item: Extract<RowMenuItem, { kind: "action" }>) =>
    start(async () => {
      try {
        const r = await item.run();
        setConfirming(null);
        if (r.ok) {
          toast(r.message ?? item.success ?? "Feito.");
          router.refresh();
        } else toast(r.error, "error");
      } catch {
        toast("Erro de rede. Tente novamente.", "error");
      }
    });

  return (
    <div ref={ref} className="relative inline-block text-left">
      <button
        ref={btn}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] text-muted hover:bg-surface-3 hover:text-fg"
        disabled={pending}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div ref={menu} role="menu" style={pos} className="fixed z-50 max-h-[calc(100dvh-16px)] w-52 animate-fade-in overflow-y-auto rounded-[var(--radius-md)] border border-line-strong bg-surface-2 py-1 shadow-[var(--shadow-pop)]">
          {items.map((it) =>
            it.kind === "link" ? (
              <Link key={it.label} role="menuitem" href={it.href} className="block px-3 py-2.5 text-sm text-fg hover:bg-surface-3" onClick={() => setOpen(false)}>
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                className={cn("block w-full px-3 py-2.5 text-left text-sm hover:bg-surface-3", it.danger ? "text-danger" : "text-fg")}
                onClick={() => {
                  setOpen(false);
                  if (it.confirm) setConfirming(it);
                  else exec(it);
                }}
              >
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
      <Modal
        open={!!confirming}
        onClose={() => !pending && setConfirming(null)}
        title={confirming?.label ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant={confirming?.danger ? "danger" : "primary"} loading={pending} onClick={() => confirming && exec(confirming)}>
              Confirmar
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{confirming?.confirm}</p>
      </Modal>
    </div>
  );
}
