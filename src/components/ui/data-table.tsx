import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right";
  /**
   * Como a coluna aparece em ecrãs pequenos: título do cartão, linha secundária, coluna à direita, bloco a toda
   * a largura por baixo (avisos longos), botão/menu no canto do cartão, ou oculta.
   */
  mobile?: "title" | "meta" | "hide" | "end" | "block" | "action";
  /** Conteúdo diferente para o cartão do telemóvel (predefinição: o mesmo da tabela). */
  mobileCell?: (row: T) => React.ReactNode;
  /** Só no telemóvel (não aparece como coluna da tabela no computador). */
  mobileOnly?: boolean;
}

/**
 * Tabela responsiva: em ecrãs ≥ md mostra uma tabela; em telemóvel mostra uma lista de cartões.
 */
export function DataTable<T>({ rows, columns, rowKey, rowHref, empty }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; rowHref?: (r: T) => string; empty?: React.ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  const title = columns.find((c) => c.mobile === "title") ?? columns[0];
  const end = columns.filter((c) => c.mobile === "end");
  const blocks = columns.filter((c) => c.mobile === "block");
  const actions = columns.filter((c) => c.mobile === "action");
  const meta = columns.filter((c) => c !== title && !end.includes(c) && c.mobile !== "hide" && (c.mobile === "meta" || c.mobile === undefined));
  const desktop = columns.filter((c) => !c.mobileOnly);
  const m = (c: Column<T>, r: T) => (c.mobileCell ?? c.cell)(r);
  return (
    <>
      <div className="relative hidden overflow-x-auto scrollbar-thin md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11.5px] uppercase tracking-wider text-subtle">
              {desktop.map((c) => (
                <th key={c.key} scope="col" className={cn("whitespace-nowrap px-4 py-3 font-medium first:pl-5 last:pr-5", c.align === "right" && "text-right", c.className)}>
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} className="group border-b border-line/70 transition-colors last:border-0 hover:bg-surface-2/60">
                {desktop.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3.5 align-middle first:pl-5 last:pr-5", c.align === "right" && "text-right", c.className)}>
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
            <div className="flex flex-col gap-2.5 px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="min-w-0 font-medium text-fg">{m(title, r)}</div>
                  {meta.length > 0 && (
                    <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted">
                      {meta.map((c) => (
                        <span key={c.key} className="min-w-0 max-w-full">
                          {m(c, r)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {end.length > 0 && <div className="flex max-w-[45%] shrink-0 flex-col items-end gap-1.5 text-right">{end.map((c) => <div key={c.key} className="max-w-full">{m(c, r)}</div>)}</div>}
                {actions.length > 0 && <div className="-mr-2 -mt-1 flex shrink-0 items-center">{actions.map((c) => <div key={c.key}>{m(c, r)}</div>)}</div>}
              </div>
              {blocks.map((c) => (
                <div key={c.key} className="min-w-0 text-[13px]">
                  {m(c, r)}
                </div>
              ))}
            </div>
          );
          return <li key={rowKey(r)}>{rowHref ? <div className="active:bg-surface-2">{inner}</div> : inner}</li>;
        })}
      </ul>
    </>
  );
}
