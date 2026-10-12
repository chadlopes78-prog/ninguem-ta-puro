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
  const toast = useToast();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
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
        <div role="menu" className="absolute right-0 z-40 mt-1 w-48 animate-fade-in overflow-hidden rounded-[var(--radius-md)] border border-line-strong bg-surface-2 py-1 shadow-[var(--shadow-pop)]">
          {items.map((it) =>
            it.kind === "link" ? (
              <Link key={it.label} role="menuitem" href={it.href} className="block px-3 py-2 text-sm text-fg hover:bg-surface-3" onClick={() => setOpen(false)}>
                {it.label}
              </Link>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                className={cn("block w-full px-3 py-2 text-left text-sm hover:bg-surface-3", it.danger ? "text-danger" : "text-fg")}
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
