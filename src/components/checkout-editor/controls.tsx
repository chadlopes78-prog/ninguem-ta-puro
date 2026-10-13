"use client";

import { useId } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, Select, Textarea } from "@/components/ui/field";

/** Linha de propriedade: rótulo + controlo, acessível. */
export function Prop({ label, children, hint, inline }: { label: string; children: (id: string) => React.ReactNode; hint?: string; inline?: boolean }) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 gap-1.5", inline ? "items-center justify-between" : "flex-col")}>
      <label htmlFor={id} className="text-[12.5px] font-medium text-fg/85">
        {label}
      </label>
      {children(id)}
      {hint && <p className="text-[11.5px] leading-snug text-subtle">{hint}</p>}
    </div>
  );
}

export function TextProp({ label, value, onChange, max, area, placeholder, rows = 4 }: { label: string; value: string; onChange: (v: string) => void; max: number; area?: boolean; placeholder?: string; rows?: number }) {
  return (
    <Prop label={label}>
      {(id) =>
        area ? (
          <Textarea id={id} value={value} maxLength={max} rows={rows} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        ) : (
          <Input id={id} value={value} maxLength={max} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        )
      }
    </Prop>
  );
}

/** Número com cursor + campo (com unidade). `undefined` = predefinição, com botão para repor. */
export function NumberProp({ label, value, onChange, min, max, step = 1, unit = "px", fallback, optional }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; min: number; max: number; step?: number; unit?: string; fallback?: number; optional?: boolean }) {
  const shown = value ?? fallback ?? min;
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Math.round(v / step) * step)));
  return (
    <Prop label={label}>
      {(id) => (
        <div className="flex items-center gap-2">
          <input type="range" min={min} max={max} step={step} value={shown} onChange={(e) => set(Number(e.target.value))} className={cn("min-w-0 flex-1 accent-[var(--color-accent)]", value === undefined && optional && "opacity-50")} aria-label={`${label} (cursor)`} />
          <div className="relative w-[84px] shrink-0">
            <Input id={id} type="number" min={min} max={max} step={step} value={value === undefined && optional ? "" : shown} placeholder={fallback !== undefined ? String(fallback) : "auto"} onChange={(e) => (e.target.value === "" && optional ? onChange(undefined) : set(Number(e.target.value)))} className="h-8 pr-7 text-[13px] tabular" />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-subtle">{unit}</span>
          </div>
          {optional && value !== undefined && (
            <button type="button" onClick={() => onChange(undefined)} className="grid h-7 w-7 shrink-0 place-items-center rounded text-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Repor ${label}`} title="Repor predefinição">
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </Prop>
  );
}

/** Cor #RRGGBB (seletor + texto). Opcional: pode ser limpa (volta à cor do tema). */
export function ColorProp({ label, value, onChange, optional = true }: { label: string; value: string | undefined; onChange: (v: string | undefined) => void; optional?: boolean }) {
  const valid = !!value && /^#[0-9a-f]{6}$/i.test(value);
  return (
    <Prop label={label}>
      {(id) => (
        <div className="flex items-center gap-2">
          <input type="color" aria-label={`${label} — seletor`} value={valid ? value : "#888888"} onChange={(e) => onChange(e.target.value.toUpperCase())} className={cn("h-8 w-9 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5", !valid && "opacity-50")} />
          <Input
            id={id}
            value={value ?? ""}
            placeholder={optional ? "Do tema" : "#RRGGBB"}
            maxLength={7}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (v === "" && optional) onChange(undefined);
              else if (/^#[0-9a-f]{0,6}$/i.test(v)) onChange(v.toUpperCase());
            }}
            className="h-8 font-mono text-[13px] uppercase"
          />
          {optional && value && (
            <button type="button" onClick={() => onChange(undefined)} className="grid h-7 w-7 shrink-0 place-items-center rounded text-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Limpar ${label}`} title="Usar a cor do tema">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </Prop>
  );
}

export function SelectProp<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <Prop label={label}>
      {(id) => (
        <Select id={id} value={value} onChange={(e) => onChange(e.target.value as T)} className="h-9 text-[13px]">
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      )}
    </Prop>
  );
}

/** Grupo de botões (escolha única), ex.: alinhamento. */
export function Segmented<T extends string>({ label, value, onChange, options }: { label: string; value: T | undefined; onChange: (v: T) => void; options: { value: T; label: string; icon?: React.ReactNode }[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-fg/85">{label}</span>
      <div className="grid gap-1 rounded-[var(--radius-md)] border border-line bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(o.value)}
            title={o.label}
            className={cn("flex h-7 items-center justify-center gap-1 rounded-[6px] text-[12px] font-medium transition-colors", value === o.value ? "bg-surface-3 text-fg shadow-sm" : "text-muted hover:text-fg")}
          >
            {o.icon ?? o.label}
            {o.icon && <span className="sr-only">{o.label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({ label, checked, onChange, disabled, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; hint?: string }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={cn("flex cursor-pointer items-center justify-between gap-3 text-[12.5px] font-medium text-fg/85", disabled && "cursor-not-allowed opacity-50")}>
        {label}
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span aria-hidden="true" className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40", checked ? "bg-accent" : "bg-surface-3")}>
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[18px]" : "translate-x-0.5")} />
        </span>
      </label>
      {hint && <p className="text-[11.5px] leading-snug text-subtle">{hint}</p>}
    </div>
  );
}

/** Editor de listas (benefícios, testemunhos, perguntas…). */
export function ListProp<T>({ items, onChange, render, empty, addLabel, max }: { items: T[]; onChange: (items: T[]) => void; render: (item: T, set: (v: T) => void, i: number) => React.ReactNode; empty: T; addLabel: string; max: number }) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it, i) => (
        <div key={i} className="relative rounded-[var(--radius-md)] border border-line bg-surface-2/40 p-3 pt-7">
          <span className="absolute left-3 top-2 text-[10.5px] font-semibold uppercase tracking-wider text-subtle">{i + 1}</span>
          <button type="button" onClick={() => onChange(items.filter((_, k) => k !== i))} className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded text-subtle hover:text-danger" aria-label={`Remover item ${i + 1}`}>
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex flex-col gap-2.5">{render(it, (v) => onChange(items.map((x, k) => (k === i ? v : x))), i)}</div>
        </div>
      ))}
      {items.length < max && (
        <button type="button" onClick={() => onChange([...items, empty])} className="flex h-8 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-dashed border-line text-[12.5px] font-medium text-muted hover:border-accent/50 hover:text-fg">
          <Plus className="h-3.5 w-3.5" /> {addLabel}
        </button>
      )}
    </div>
  );
}

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-line px-4 py-4 last:border-b-0">
      <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-subtle">{title}</h3>
      {children}
    </section>
  );
}
