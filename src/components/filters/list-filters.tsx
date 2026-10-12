"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

export interface FilterSelect {
  name: string;
  label: string;
  options: { value: string; label: string }[];
}

/** Pesquisa + filtros sincronizados com o URL (resultados recalculados no servidor). */
export function ListFilters({ placeholder = "Pesquisar…", selects = [] }: { placeholder?: string; selects?: FilterSelect[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  const first = useRef(true);

  const push = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    sp.delete("page");
    router.replace(`${pathname}${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => push({ q: q.trim() }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-0 sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden="true" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="Pesquisar"
          className="h-10 w-full rounded-[var(--radius-md)] border border-line bg-surface-2 pl-9 pr-9 text-sm text-fg placeholder:text-subtle focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/20"
        />
        {q && (
          <button onClick={() => setQ("")} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded text-subtle hover:text-fg" aria-label="Limpar pesquisa">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {selects.map((s) => (
          <select
            key={s.name}
            aria-label={s.label}
            value={params.get(s.name) ?? ""}
            onChange={(e) => push({ [s.name]: e.target.value })}
            className="h-10 min-w-0 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 text-sm text-fg"
          >
            {s.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ))}
      </div>
    </div>
  );
}
