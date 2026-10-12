import { cn } from "@/lib/utils";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info" | "demo";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-3 text-muted border-line",
  accent: "bg-accent-soft text-accent border-accent/25",
  success: "bg-success/10 text-success border-success/25",
  warning: "bg-warning/10 text-warning border-warning/25",
  danger: "bg-danger/10 text-danger border-danger/25",
  info: "bg-info/10 text-info border-info/25",
  demo: "bg-demo/10 text-demo border-demo/30",
};

export function Badge({ tone = "neutral", dot, className, children }: { tone?: Tone; dot?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11.5px] font-medium", tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return (
    <Badge tone="demo" className={cn("font-semibold uppercase tracking-wide", className)}>
      Dados de demonstração
    </Badge>
  );
}
