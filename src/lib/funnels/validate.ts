import { OFFER_STEP_TYPES, STEP_META, type FunnelGraph, type GraphNode } from "./types";

export interface FunnelIssue {
  level: "error" | "warning";
  message: string;
  nodeKey?: string;
  edgeKey?: string;
  field?: string;
}

export interface FunnelRefs {
  products: Map<string, { name: string; archived: boolean; offers: Map<string, { active: boolean }> }>;
  checkouts: Map<string, { name: string; active: boolean }>;
}

export interface FunnelValidation {
  valid: boolean;
  errors: FunnelIssue[];
  warnings: FunnelIssue[];
}

const nodeName = (n: GraphNode) => `“${n.label || STEP_META[n.type].label}”`;

/** Valida a estrutura e configuração de um funil. Erros bloqueiam a ativação; avisos não. */
export function validateFunnel(graph: FunnelGraph, refs?: FunnelRefs): FunnelValidation {
  const issues: FunnelIssue[] = [];
  const err = (i: Omit<FunnelIssue, "level">) => issues.push({ level: "error", ...i });
  const warn = (i: Omit<FunnelIssue, "level">) => issues.push({ level: "warning", ...i });

  const byKey = new Map<string, GraphNode>();
  for (const n of graph.nodes) {
    if (byKey.has(n.key)) err({ nodeKey: n.key, message: `Etapa duplicada: ${n.key}` });
    byKey.set(n.key, n);
  }

  const starts = graph.nodes.filter((n) => n.type === "START");
  if (starts.length === 0) err({ message: "O funil precisa de uma etapa “Início do funil”." });
  if (starts.length > 1) starts.slice(1).forEach((n) => err({ nodeKey: n.key, message: "Só pode existir um “Início do funil”." }));
  if (!graph.nodes.some((n) => n.type === "CHECKOUT")) err({ message: "O funil precisa de pelo menos um “Checkout principal”." });
  if (!graph.nodes.some((n) => n.type === "THANK_YOU" || n.type === "END")) {
    err({ message: "O funil precisa de uma “Página de obrigado” ou “Fim do funil”." });
  }

  // Ligações
  const outgoing = new Map<string, Map<string, string>>(); // node -> handle -> target
  const incoming = new Map<string, number>();
  for (const e of graph.edges) {
    const s = byKey.get(e.source);
    const t = byKey.get(e.target);
    if (!s || !t) {
      err({ edgeKey: e.key, message: "Ligação a uma etapa inexistente." });
      continue;
    }
    if (e.source === e.target) {
      err({ edgeKey: e.key, nodeKey: s.key, message: `${nodeName(s)} não pode ligar a si própria.` });
      continue;
    }
    if (!STEP_META[s.type].handles.includes(e.sourceHandle)) {
      err({ edgeKey: e.key, nodeKey: s.key, message: `Saída inválida em ${nodeName(s)}.` });
      continue;
    }
    if (!STEP_META[t.type].hasInput) {
      err({ edgeKey: e.key, nodeKey: t.key, message: `${nodeName(t)} não pode receber ligações.` });
      continue;
    }
    const handles = outgoing.get(s.key) ?? new Map<string, string>();
    if (handles.has(e.sourceHandle)) {
      err({ edgeKey: e.key, nodeKey: s.key, message: `${nodeName(s)} tem mais de um destino na mesma saída.` });
      continue;
    }
    handles.set(e.sourceHandle, t.key);
    outgoing.set(s.key, handles);
    incoming.set(t.key, (incoming.get(t.key) ?? 0) + 1);
  }

  for (const n of graph.nodes) {
    const meta = STEP_META[n.type];
    const out = outgoing.get(n.key);
    // destinos obrigatórios
    if (n.type === "THANK_YOU" || n.type === "END") {
      // terminais: saída opcional (obrigado → fim)
    } else {
      for (const h of meta.handles) {
        if (!out?.has(h)) {
          const what = h === "accept" ? "o destino “Se aceitar”" : h === "decline" ? "o destino “Se recusar”" : "a etapa seguinte";
          err({ nodeKey: n.key, field: h, message: `${nodeName(n)}: falta ${what}.` });
        }
      }
    }
    if (n.type !== "START" && !incoming.get(n.key)) warn({ nodeKey: n.key, message: `${nodeName(n)} não recebe nenhuma ligação.` });

    // configuração
    const c = n.config ?? {};
    if (!n.label?.trim()) err({ nodeKey: n.key, field: "label", message: `Etapa ${STEP_META[n.type].label} sem nome.` });
    if (n.type === "CHECKOUT") {
      if (!c.checkoutId) err({ nodeKey: n.key, field: "checkoutId", message: `${nodeName(n)}: selecione um checkout.` });
      else if (refs) {
        const ck = refs.checkouts.get(c.checkoutId);
        if (!ck) err({ nodeKey: n.key, field: "checkoutId", message: `${nodeName(n)}: o checkout selecionado não existe.` });
        else if (!ck.active) warn({ nodeKey: n.key, field: "checkoutId", message: `${nodeName(n)}: o checkout “${ck.name}” está desativado.` });
      }
    }
    if (OFFER_STEP_TYPES.includes(n.type)) {
      if (!c.productId) err({ nodeKey: n.key, field: "productId", message: `${nodeName(n)}: selecione um produto.` });
      if (!c.offerId) err({ nodeKey: n.key, field: "offerId", message: `${nodeName(n)}: selecione uma oferta/preço.` });
      if (!c.headline?.trim()) err({ nodeKey: n.key, field: "headline", message: `${nodeName(n)}: falta o título da oferta.` });
      if (refs && c.productId) {
        const p = refs.products.get(c.productId);
        if (!p) err({ nodeKey: n.key, field: "productId", message: `${nodeName(n)}: o produto selecionado não existe.` });
        else {
          if (p.archived) err({ nodeKey: n.key, field: "productId", message: `${nodeName(n)}: o produto “${p.name}” está arquivado.` });
          if (c.offerId) {
            const o = p.offers.get(c.offerId);
            if (!o) err({ nodeKey: n.key, field: "offerId", message: `${nodeName(n)}: a oferta não pertence ao produto.` });
            else if (!o.active) err({ nodeKey: n.key, field: "offerId", message: `${nodeName(n)}: a oferta está inativa.` });
          }
        }
      }
    }
    if (n.type === "SALES_PAGE" && !c.url && !c.productId) {
      warn({ nodeKey: n.key, field: "url", message: `${nodeName(n)}: defina o URL da página ou um produto.` });
    }
    if (n.type === "THANK_YOU" && !c.title?.trim()) {
      warn({ nodeKey: n.key, field: "title", message: `${nodeName(n)}: sem título (será usado um texto padrão).` });
    }
  }

  // Downsell normalmente surge após recusa
  for (const n of graph.nodes.filter((x) => x.type === "DOWNSELL")) {
    const reachedByDecline = graph.edges.some((e) => e.target === n.key && e.sourceHandle === "decline");
    if (!reachedByDecline) warn({ nodeKey: n.key, message: `${nodeName(n)}: um downsell costuma ser apresentado após uma recusa.` });
  }

  // Ciclos (percursos infinitos)
  const cycle = findCycle(graph.nodes.map((n) => n.key), outgoing);
  if (cycle) {
    const names = cycle.map((k) => byKey.get(k)?.label ?? k).join(" → ");
    err({ nodeKey: cycle[0], message: `Ciclo detetado: ${names}. Os percursos não podem repetir etapas.` });
  }

  // Alcance a partir do início
  if (starts.length === 1) {
    const reachable = new Set<string>();
    const stack = [starts[0].key];
    while (stack.length) {
      const k = stack.pop()!;
      if (reachable.has(k)) continue;
      reachable.add(k);
      for (const t of outgoing.get(k)?.values() ?? []) stack.push(t);
    }
    for (const n of graph.nodes) {
      if (!reachable.has(n.key)) warn({ nodeKey: n.key, message: `${nodeName(n)} não é alcançável a partir do início.` });
    }
    const checkoutsReachable = graph.nodes.some((n) => n.type === "CHECKOUT" && reachable.has(n.key));
    if (graph.nodes.some((n) => n.type === "CHECKOUT") && !checkoutsReachable) {
      err({ message: "Nenhum checkout é alcançável a partir do início do funil." });
    }
  }

  const errors = issues.filter((i) => i.level === "error");
  const warnings = issues.filter((i) => i.level === "warning");
  return { valid: errors.length === 0, errors, warnings };
}

function findCycle(keys: string[], outgoing: Map<string, Map<string, string>>): string[] | null {
  const state = new Map<string, 0 | 1 | 2>();
  const path: string[] = [];
  const visit = (k: string): string[] | null => {
    state.set(k, 1);
    path.push(k);
    for (const t of outgoing.get(k)?.values() ?? []) {
      const s = state.get(t) ?? 0;
      if (s === 1) return [...path.slice(path.indexOf(t)), t];
      if (s === 0) {
        const r = visit(t);
        if (r) return r;
      }
    }
    path.pop();
    state.set(k, 2);
    return null;
  };
  for (const k of keys) {
    if ((state.get(k) ?? 0) === 0) {
      const r = visit(k);
      if (r) return r;
    }
  }
  return null;
}
