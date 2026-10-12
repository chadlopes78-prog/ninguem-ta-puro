import { OFFER_STEP_TYPES, type FunnelGraph, type GraphNode, type SourceHandle } from "./types";

export type Decision = "accept" | "decline";

/** Etapas em que o comprador toma uma decisão ou vê uma página final. */
export function isInteractive(node: GraphNode): boolean {
  return OFFER_STEP_TYPES.includes(node.type) || node.type === "THANK_YOU" || node.type === "END";
}

export function nextKey(graph: FunnelGraph, fromKey: string, handle: SourceHandle): string | null {
  return graph.edges.find((e) => e.source === fromKey && e.sourceHandle === handle)?.target ?? null;
}

/**
 * Avança automaticamente pelas etapas não interativas (início, página de vendas, checkout, compra aprovada)
 * até à próxima etapa interativa. Protegido contra ciclos.
 */
export function advanceToInteractive(graph: FunnelGraph, fromKey: string): GraphNode | null {
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  let current = byKey.get(fromKey) ?? null;
  const seen = new Set<string>();
  while (current && !isInteractive(current)) {
    if (seen.has(current.key)) return null;
    seen.add(current.key);
    const nk = nextKey(graph, current.key, "next");
    current = nk ? (byKey.get(nk) ?? null) : null;
  }
  return current;
}

/** Aplica uma decisão numa etapa de oferta e devolve a próxima etapa interativa. */
export function decide(graph: FunnelGraph, atKey: string, decision: Decision): GraphNode | null {
  const nk = nextKey(graph, atKey, decision);
  return nk ? advanceToInteractive(graph, nk) : null;
}

export interface SimulationStep {
  key: string;
  type: GraphNode["type"];
  label: string;
  decision?: Decision;
}

/** Percorre o funil a partir do checkout (após compra aprovada simulada) aplicando as decisões dadas. */
export function simulatePath(graph: FunnelGraph, startKey: string, decisions: Decision[], maxSteps = 50): SimulationStep[] {
  const byKey = new Map(graph.nodes.map((n) => [n.key, n]));
  const path: SimulationStep[] = [];
  const startNode = byKey.get(startKey);
  if (!startNode) return path;
  const firstNext = startNode.type === "START" || startNode.type === "CHECKOUT" || startNode.type === "SALES_PAGE" || startNode.type === "PURCHASE_APPROVED"
    ? nextKey(graph, startKey, "next")
    : startKey;
  let node = firstNext ? advanceToInteractive(graph, firstNext) : null;
  let i = 0;
  while (node && i < maxSteps) {
    if (!OFFER_STEP_TYPES.includes(node.type)) {
      path.push({ key: node.key, type: node.type, label: node.label });
      break;
    }
    const d = decisions[i] ?? "decline";
    path.push({ key: node.key, type: node.type, label: node.label, decision: d });
    node = decide(graph, node.key, d);
    i++;
  }
  return path;
}
