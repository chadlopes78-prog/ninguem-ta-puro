import { cn } from "@/lib/utils";

/** Barras horizontais em HTML com rótulos diretos (legíveis em qualquer largura). */
export function BarList({ items, emptyLabel = "Sem dados no período." }: { items: { key: string; label: React.ReactNode; value: number; display: string; color?: string; sub?: string }[]; emptyLabel?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length || items.every((i) => i.value === 0)) return <p className="py-6 text-center text-sm text-subtle">{emptyLabel}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {items.map((i) => (
        <li key={i.key} className="group" title={`${typeof i.label === "string" ? i.label : ""}: ${i.display}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-fg/90">{i.label}</span>
            <span className="shrink-0 font-medium text-fg tabular">
              {i.display}
              {i.sub && <span className="ml-1.5 font-normal text-subtle">{i.sub}</span>}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-3">
            <div className={cn("h-full rounded-full transition-[width] duration-500")} style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: i.color ?? "var(--color-accent)" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
