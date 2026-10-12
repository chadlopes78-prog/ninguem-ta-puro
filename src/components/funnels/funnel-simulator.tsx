"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { advanceToInteractive, decide, nextKey, type Decision } from "@/lib/funnels/simulate";
import { OFFER_STEP_TYPES, STEP_META, type FunnelGraph, type GraphNode } from "@/lib/funnels/types";
import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import type { BuilderProduct } from "./funnel-builder";

/** Simulação local do percurso pós-compra (não cria pedidos nem eventos). */
export function FunnelSimulator({ graph, products }: { graph: FunnelGraph; products: BuilderProduct[] }) {
  const checkoutNodes = graph.nodes.filter((n) => n.type === "CHECKOUT");
  const [entry, setEntry] = useState(checkoutNodes[0]?.key ?? "");
  const first = useMemo(() => {
    const nk = entry ? nextKey(graph, entry, "next") : null;
    return nk ? advanceToInteractive(graph, nk) : null;
  }, [graph, entry]);
  const [current, setCurrent] = useState<GraphNode | null>(first);
  const [history, setHistory] = useState<{ node: GraphNode; decision: Decision }[]>([]);

  const reset = (k = entry) => {
    setEntry(k);
    const nk = k ? nextKey(graph, k, "next") : null;
    setCurrent(nk ? advanceToInteractive(graph, nk) : null);
    setHistory([]);
  };

  const offerOf = (n: GraphNode) => {
    const p = products.find((x) => x.id === n.config.productId);
    const o = p?.offers.find((x) => x.id === n.config.offerId);
    return p && o ? { ...o, name: `${p.name} — ${o.name}` } : undefined;
  };
  const choose = (d: Decision) => {
    if (!current) return;
    setHistory((h) => [...h, { node: current, decision: d }]);
    setCurrent(decide(graph, current.key, d));
  };
  const accepted = history.filter((h) => h.decision === "accept").map((h) => offerOf(h.node)).filter(Boolean);

  return (
    <div className="flex flex-col gap-4" data-testid="funnel-simulator">
      {checkoutNodes.length > 1 && (
        <label className="flex flex-col gap-1 text-[13px] text-muted">
          Checkout de entrada
          <select value={entry} onChange={(e) => reset(e.target.value)} className="h-10 rounded-[var(--radius-md)] border border-line bg-surface-2 px-3 text-sm text-fg">
            {checkoutNodes.map((n) => (
              <option key={n.key} value={n.key}>
                {n.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <ol className="flex flex-wrap items-center gap-1.5 text-[12px]">
        <li className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-muted">Compra aprovada (simulada)</li>
        {history.map((h, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <ArrowRight className="h-3 w-3 text-subtle" aria-hidden="true" />
            <span className={h.decision === "accept" ? "rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-success" : "rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 text-danger"}>
              {h.node.label}: {h.decision === "accept" ? "aceitou" : "recusou"}
            </span>
          </li>
        ))}
      </ol>

      <div className="rounded-[var(--radius-lg)] border border-line bg-surface-2 p-5">
        {!current ? (
          <p className="text-sm text-muted">O percurso termina aqui (sem etapa seguinte configurada).</p>
        ) : OFFER_STEP_TYPES.includes(current.type) ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">{STEP_META[current.type].label}</p>
            <h3 className="mt-1 font-display text-lg font-semibold">{current.config.headline ?? current.label}</h3>
            {current.config.body && <p className="mt-1 text-sm text-muted">{current.config.body}</p>}
            {offerOf(current) && <p className="mt-2 text-sm text-fg">{formatMoney(offerOf(current)!.priceCents, offerOf(current)!.currency)}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => choose("accept")} data-testid="sim-accept">
                <Check className="h-4 w-4" /> {current.config.acceptText ?? "Aceitar"}
              </Button>
              <Button variant="secondary" onClick={() => choose("decline")} data-testid="sim-decline">
                <X className="h-4 w-4" /> {current.config.declineText ?? "Recusar"}
              </Button>
            </div>
          </div>
        ) : (
          <div data-testid="sim-final">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-success">{STEP_META[current.type].label}</p>
            <h3 className="mt-1 font-display text-lg font-semibold">{current.config.title ?? current.label}</h3>
            <p className="mt-2 text-sm text-muted">
              Ofertas aceites: {accepted.length ? accepted.map((o) => `${o!.name} (${formatMoney(o!.priceCents, o!.currency)})`).join(", ") : "nenhuma"}.
            </p>
          </div>
        )}
      </div>
      <div className="flex justify-between">
        <p className="text-[12px] text-subtle">Nenhuma cobrança, pedido ou métrica é criado nesta simulação.</p>
        <Button variant="ghost" size="sm" onClick={() => reset()}>
          <RotateCcw className="h-4 w-4" /> Recomeçar
        </Button>
      </div>
    </div>
  );
}
