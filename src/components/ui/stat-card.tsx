import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip } from "./tooltip";

export function StatCard({
  label,
  value,
  sub,
  delta,
  invertDelta,
  hint,
  highlight,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  delta?: number | null;
  invertDelta?: boolean;
  hint?: string;
  highlight?: boolean;
}) {
  const positive = delta !== null && delta !== undefined && (invertDelta ? delta < 0 : delta > 0);
  const negative = delta !== null && delta !== undefined && (invertDelta ? delta > 0 : delta < 0);
  return (
    <div
      className={cn(
        "relative flex min-w-0 flex-col gap-2 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface p-4 shadow-[var(--shadow-card)] sm:p-5",
        highlight && "border-accent/25 bg-[linear-gradient(180deg,rgb(200_241_53/0.06),transparent_60%)]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate text-[12.5px] font-medium text-muted">
          {label}
          {hint && <Tooltip content={hint} />}
        </span>
        {delta !== undefined && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular",
              positive && "bg-success/10 text-success",
              negative && "bg-danger/10 text-danger",
              !positive && !negative && "bg-surface-3 text-subtle",
            )}
            title="Comparação com o período anterior"
          >
            {delta === null ? (
              "novo"
            ) : delta === 0 ? (
              <>
                <Minus className="h-3 w-3" aria-hidden="true" />0%
              </>
            ) : (
              <>
                {delta > 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}
                {Math.abs(delta).toLocaleString("pt-BR")}%
              </>
            )}
          </span>
        )}
      </div>
      <div className="truncate font-display text-[22px] font-semibold tracking-tight text-fg tabular sm:text-2xl">{value}</div>
      {sub && <div className="truncate text-[12px] text-subtle">{sub}</div>}
    </div>
  );
}
