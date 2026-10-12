import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "info" | "success" | "warning" | "danger" | "demo";
const styles: Record<Tone, string> = {
  info: "border-info/25 bg-info/[0.06] text-info",
  success: "border-success/25 bg-success/[0.06] text-success",
  warning: "border-warning/25 bg-warning/[0.06] text-warning",
  danger: "border-danger/25 bg-danger/[0.06] text-danger",
  demo: "border-demo/30 bg-demo/[0.07] text-demo",
};
const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: XCircle, demo: AlertTriangle };

export function Alert({ tone = "info", title, children, className, action }: { tone?: Tone; title?: React.ReactNode; children?: React.ReactNode; className?: string; action?: React.ReactNode }) {
  const Icon = icons[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-[var(--radius-md)] border px-4 py-3 text-sm", styles[tone], className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn("text-fg/80", title && "mt-0.5")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
