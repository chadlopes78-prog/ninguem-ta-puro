import { Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** Capa do produto ou placeholder profissional com iniciais. */
export function ProductCover({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn("h-10 w-10 shrink-0 rounded-[var(--radius-sm)] border border-line object-cover", className)} />;
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return (
    <div className={cn("relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-line bg-[linear-gradient(135deg,#1c2025,#111316)]", className)} aria-hidden="true">
      {initials ? <span className="font-display text-[12px] font-semibold text-accent">{initials}</span> : <Package className="h-4 w-4 text-subtle" />}
    </div>
  );
}
