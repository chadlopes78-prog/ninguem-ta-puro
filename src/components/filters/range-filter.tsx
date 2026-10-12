"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { cn } from "@/lib/utils";
import { RANGE_LABELS, RANGE_PRESETS, type RangePreset } from "@/lib/dates";
import { Button } from "@/components/ui/button";

/** Filtro de período que atualiza os parâmetros do URL (os dados são recalculados no servidor). */
export function RangeFilter({ preset, from, to, currencies, currency }: { preset: RangePreset; from?: string; to?: string; currencies?: string[]; currency?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [showCustom, setShowCustom] = useState(preset === "custom");
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");
  const invalid = Boolean(f && t && f > t);

  const push = (next: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete("page");
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 pb-0.5 scrollbar-thin" role="group" aria-label="Período">
          {RANGE_PRESETS.filter((p) => p !== "custom").map((p) => (
            <button
              key={p}
              onClick={() => {
                setShowCustom(false);
                push({ range: p, from: undefined, to: undefined });
              }}
              aria-pressed={preset === p}
              className={cn(
                "h-9 shrink-0 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors",
                preset === p ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-muted hover:border-line-strong hover:text-fg",
              )}
            >
              {RANGE_LABELS[p]}
            </button>
          ))}
          <button
            onClick={() => setShowCustom((s) => !s)}
            aria-pressed={preset === "custom"}
            aria-expanded={showCustom}
            className={cn(
              "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-medium transition-colors",
              preset === "custom" ? "border-accent/40 bg-accent-soft text-accent" : "border-line text-muted hover:border-line-strong hover:text-fg",
            )}
          >
            <CalendarRange className="h-3.5 w-3.5" aria-hidden="true" /> Personalizado
          </button>
        </div>
        {currencies && currencies.length > 1 && (
          <select
            aria-label="Moeda"
            value={currency}
            onChange={(e) => push({ currency: e.target.value })}
            className="h-9 rounded-full border border-line bg-surface-2 px-3 text-[12.5px] text-fg"
          >
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
      </div>
      {showCustom && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (f && t && !invalid) push({ range: "custom", from: f, to: t });
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            De
            <input type="date" value={f} onChange={(e) => setF(e.target.value)} required className="h-9 rounded-[var(--radius-md)] border border-line bg-surface-2 px-2.5 text-sm text-fg" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-muted">
            Até
            <input type="date" value={t} onChange={(e) => setT(e.target.value)} required className="h-9 rounded-[var(--radius-md)] border border-line bg-surface-2 px-2.5 text-sm text-fg" />
          </label>
          <Button type="submit" size="sm" className="h-9" disabled={!f || !t || invalid}>
            Aplicar
          </Button>
          {invalid && <p className="w-full text-[12px] text-danger" role="alert">A data inicial deve ser anterior à final.</p>}
        </form>
      )}
    </div>
  );
}
