"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageIcon, Link2, Loader2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { IMAGE_ACCEPT, prepareImage as prepare } from "@/lib/image-upload";

interface Asset {
  id: string;
  url: string;
  filename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

const ACCEPT = IMAGE_ACCEPT;

export function MediaPicker({ open, onClose, onPick, current }: { open: boolean; onClose: () => void; onPick: (src: string) => void; current?: string }) {
  const [tab, setTab] = useState<"upload" | "library" | "url">("upload");
  const [items, setItems] = useState<Asset[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState(current && /^https:\/\//.test(current) ? current : "");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/media", { cache: "no-store" });
      const j = (await r.json()) as { items?: Asset[]; error?: string };
      if (!r.ok) throw new Error(j.error);
      setItems(j.items ?? []);
    } catch (e) {
      setItems([]);
      toast(e instanceof Error && e.message ? e.message : "Não foi possível carregar a biblioteca.", "error");
    }
  }, [toast]);

  useEffect(() => {
    if (open && items === null) void load();
  }, [open, items, load]);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      toast("Formato não suportado. Use JPEG, PNG, WebP ou GIF.", "error");
      return;
    }
    setBusy(true);
    try {
      const prepared = await prepare(file);
      const fd = new FormData();
      fd.append("file", prepared);
      const r = await fetch("/api/media", { method: "POST", body: fd });
      const j = (await r.json().catch(() => ({}))) as { item?: Asset; error?: string };
      if (!r.ok || !j.item) throw new Error(j.error ?? "Não foi possível carregar a imagem.");
      setItems((cur) => [j.item!, ...(cur ?? []).filter((x) => x.id !== j.item!.id)]);
      toast("Imagem carregada.");
      onPick(j.item.url);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não foi possível carregar a imagem.", "error");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (a: Asset) => {
    if (!window.confirm(`Apagar “${a.filename}” da biblioteca?`)) return;
    const r = await fetch(`/api/media/${a.id}`, { method: "DELETE" });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      toast(j.error ?? "Não foi possível apagar a imagem.", "error");
      return;
    }
    setItems((cur) => (cur ?? []).filter((x) => x.id !== a.id));
    toast("Imagem apagada.");
  };

  const tabs = [
    { id: "upload" as const, label: "Carregar", icon: Upload },
    { id: "library" as const, label: "Biblioteca", icon: ImageIcon },
    { id: "url" as const, label: "Link", icon: Link2 },
  ];

  return (
    <Modal open={open} onClose={onClose} title="Escolher imagem" description="JPEG, PNG, WebP ou GIF até 3 MB. As imagens grandes são reduzidas automaticamente." size="lg">
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-[var(--radius-md)] border border-line bg-surface-2 p-1" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={cn("flex h-8 items-center justify-center gap-1.5 rounded-[6px] text-[13px] font-medium", tab === t.id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "upload" && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            void upload(e.dataTransfer.files[0]);
          }}
          className={cn("grid place-items-center rounded-[var(--radius-lg)] border-2 border-dashed px-4 py-10 text-center transition-colors", over ? "border-accent bg-accent-soft" : "border-line")}
        >
          {busy ? <Loader2 className="h-7 w-7 animate-spin text-accent" /> : <Upload className="h-7 w-7 text-subtle" />}
          <p className="mt-3 text-sm font-medium">{busy ? "A carregar…" : "Arraste uma imagem para aqui"}</p>
          <p className="mt-1 text-[12.5px] text-muted">ou</p>
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" id="media-file" data-testid="media-file" onChange={(e) => void upload(e.target.files?.[0])} />
          <Button variant="secondary" size="sm" className="mt-2" disabled={busy} onClick={() => input.current?.click()}>
            Escolher do dispositivo
          </Button>
        </div>
      )}

      {tab === "library" && (
        <div data-testid="media-library">
          {items === null ? (
            <p className="py-10 text-center text-sm text-muted">A carregar…</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted">Ainda não carregou imagens.</p>
          ) : (
            <ul className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
              {items.map((a) => (
                <li key={a.id} className={cn("group relative overflow-hidden rounded-[var(--radius-md)] border", current === a.url ? "border-accent ring-2 ring-accent/30" : "border-line")}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(a.url);
                      onClose();
                    }}
                    className="block w-full text-left"
                    data-testid="media-item"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt="" loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
                    <span className="block truncate px-2 py-1.5 text-[11.5px] text-muted">
                      {a.filename}
                      {a.width ? ` · ${a.width}×${a.height}` : ""}
                    </span>
                  </button>
                  <button type="button" onClick={() => void remove(a)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-md bg-black/60 text-white opacity-0 transition-opacity hover:bg-danger group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100" aria-label={`Apagar ${a.filename}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "url" && (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) {
              toast("Use um endereço que comece por https://", "error");
              return;
            }
            onPick(url);
            onClose();
          }}
        >
          <label htmlFor="media-url" className="text-[13px] font-medium">
            Endereço da imagem
          </label>
          <Input id="media-url" value={url} onChange={(e) => setUrl(e.target.value.trim())} placeholder="https://…/imagem.jpg" maxLength={2000} />
          <p className="text-[12px] text-muted">A imagem fica alojada no outro site. Para garantir que não desaparece, prefira carregá-la.</p>
          <Button type="submit" size="sm" className="self-end">
            Usar imagem
          </Button>
        </form>
      )}
    </Modal>
  );
}
