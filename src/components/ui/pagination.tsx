import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({ page, pages, total, makeHref }: { page: number; pages: number; total: number; makeHref: (p: number) => string }) {
  if (pages <= 1) return <p className="px-5 py-3 text-[12.5px] text-subtle">{total} resultado(s)</p>;
  const btn = "inline-flex h-9 items-center gap-1 rounded-[var(--radius-md)] border border-line px-3 text-[13px]";
  return (
    <nav className="flex items-center justify-between gap-2 border-t border-line px-5 py-3" aria-label="Paginação">
      <p className="text-[12.5px] text-subtle">
        Página {page} de {pages} · {total} resultados
      </p>
      <div className="flex gap-2">
        {page > 1 ? <Link className={cn(btn, "text-fg hover:bg-surface-2")} href={makeHref(page - 1)}><ChevronLeft className="h-4 w-4" /> Anterior</Link> : <span className={cn(btn, "text-subtle opacity-50")}><ChevronLeft className="h-4 w-4" /> Anterior</span>}
        {page < pages ? <Link className={cn(btn, "text-fg hover:bg-surface-2")} href={makeHref(page + 1)}>Seguinte <ChevronRight className="h-4 w-4" /></Link> : <span className={cn(btn, "text-subtle opacity-50")}>Seguinte <ChevronRight className="h-4 w-4" /></span>}
      </div>
    </nav>
  );
}
