import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right";
  /** Como a coluna aparece em ecrãs pequenos: título do cartão, linha secundária ou oculta */
  mobile?: "title" | "meta" | "hide" | "end";
}

/**
 * Tabela responsiva: em ecrãs ≥ md mostra uma tabela; em telemóvel mostra uma lista de cartões.
 */
export function DataTable<T>({ rows, columns, rowKey, rowHref, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; rowHref?: (r: T) => string; empty?: React.ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  const title = columns.find((c) => c.mobile === "title") ?? columns[0];
  const end = columns.filter((c) => c.mobile === "end");
  const meta = columns.filter((c) => c !== title && !end.includes(c) && c.mobile !== "hide" && (c.mobile === "meta" || c.mobile === undefined));
  return (
    <>
      <div className="relative hidden overflow-x-auto scrollbar-thin md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11.5px] uppercase tracking-wider text-subtle">
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("whitespace-nowrap px-5 py-3 font-medium", c.align === "right" && "text-right", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="group border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-5 py-3.5 align-middle", c.align === "right" && "text-right", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {rows.map((r) => {
          const inner = (
            <div className="flex items-start justify-between gap-3 px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-fg">{title.cell(r)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
                  {meta.map((c) => (
                    <span key={c.key} className="min-w-0">
                      {c.cell(r)}
                    </span>
                  ))}
                </div>
              </div>
              {end.length > 0 && <div className="flex shrink-0 flex-col items-end gap-1.5">{end.map((c) => <div key={c.key}>{c.cell(r)}</div>)}</div>}
            </div>
          );
          return <li key={rowKey(r)}>{rowHref ? <div className="active:bg-surface-2">{inner}</div> : inner}</li>;
        })}
      </ul>
    </>
  );
}
