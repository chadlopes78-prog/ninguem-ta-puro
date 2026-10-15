"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { IMAGE_ACCEPT, uploadImage } from "@/lib/image-upload";
import { ProductCover } from "./cover";

/**
 * Foto do produto carregada do dispositivo (computador, Android ou iPhone: galeria, câmara ou ficheiros).
 * A imagem é guardada de imediato na biblioteca da conta e o produto passa a apontar para ela quando é
 * guardado (campo escondido `imageUrl`). Imagens antigas por URL continuam a ser mostradas e mantidas.
 */
export function ProductImageField({ initial, name, error, disabled }: { initial: string; name: string; error?: string; disabled?: boolean }) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const item = await uploadImage(file);
      setValue(item.url);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "Não foi possível carregar a imagem.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const message = problem ?? error;
  return (
    <div className="flex flex-col gap-2" data-testid="product-image-field">
      <span className="text-[13px] font-medium text-fg/90">Imagem do produto</span>
      <input type="hidden" name="imageUrl" value={value} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative w-full max-w-[220px] shrink-0">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={`Imagem de ${name || "produto"}`} className="aspect-[4/3] w-full rounded-[var(--radius-md)] border border-line object-cover" data-testid="product-image-preview" />
          ) : (
            <div className="grid aspect-[4/3] w-full place-items-center rounded-[var(--radius-md)] border border-dashed border-line bg-surface-2">
              <ProductCover src={null} name={name || "?"} className="h-14 w-14 text-base" />
            </div>
          )}
          {busy && (
            <div className="absolute inset-0 grid place-items-center rounded-[var(--radius-md)] bg-black/50 text-white" role="status">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
              <span className="sr-only">A carregar a imagem…</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {/* label + input: abre o seletor nativo (galeria/câmara/ficheiros) em todos os dispositivos */}
            <label
              className={cn(
                "inline-flex h-10 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-line bg-surface-3 px-4 text-sm font-medium hover:bg-surface-hover focus-within:ring-2 focus-within:ring-accent/40",
                (busy || disabled) && "pointer-events-none opacity-60",
              )}
              data-testid="product-image-upload"
            >
              {value ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
              {value ? "Substituir imagem" : "Carregar imagem"}
              <input ref={input} type="file" accept={IMAGE_ACCEPT} className="sr-only" disabled={busy || disabled} onChange={(e) => void pick(e.target.files?.[0])} data-testid="product-image-input" />
            </label>
            {value && (
              <button
                type="button"
                onClick={() => {
                  setValue("");
                  setProblem(null);
                }}
                disabled={busy || disabled}
                className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] px-3 text-sm text-muted hover:bg-surface-2 hover:text-danger disabled:opacity-60"
                data-testid="product-image-remove"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover
              </button>
            )}
          </div>
          <p className="text-[12px] text-subtle">JPEG, PNG, WebP ou GIF até 3 MB. Fotos grandes são reduzidas automaticamente. A alteração fica gravada ao guardar o produto.</p>
          {message && (
            <p role="alert" className="text-[12.5px] font-medium text-danger" data-testid="product-image-error">
              {message}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
