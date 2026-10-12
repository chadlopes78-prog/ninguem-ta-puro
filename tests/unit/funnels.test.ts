import { describe, expect, it } from "vitest";
import { validateFunnel, type FunnelRefs } from "@/lib/funnels/validate";
import { simulatePath } from "@/lib/funnels/simulate";
import type { FunnelGraph } from "@/lib/funnels/types";

const refs: FunnelRefs = {
  products: new Map([
    ["pU", { name: "Upsell", archived: false, offers: new Map([["oU", { active: true }]]) }],
    ["pD", { name: "Downsell", archived: false, offers: new Map([["oD", { active: true }]]) }],
    ["pA", { name: "Arquivado", archived: true, offers: new Map([["oA", { active: true }]]) }],
  ]),
  checkouts: new Map([["c1", { name: "Checkout 1", active: true }]]),
};

function fullGraph(): FunnelGraph {
  return {
    nodes: [
      { key: "s", type: "START", label: "Início", position: { x: 0, y: 0 }, config: {} },
      { key: "c", type: "CHECKOUT", label: "Checkout", position: { x: 0, y: 0 }, config: { checkoutId: "c1" } },
      { key: "a", type: "PURCHASE_APPROVED", label: "Aprovada", position: { x: 0, y: 0 }, config: {} },
      { key: "u", type: "UPSELL", label: "Upsell", position: { x: 0, y: 0 }, config: { productId: "pU", offerId: "oU", headline: "Leve mais" } },
      { key: "d", type: "DOWNSELL", label: "Downsell", position: { x: 0, y: 0 }, config: { productId: "pD", offerId: "oD", headline: "Alternativa" } },
      { key: "t", type: "THANK_YOU", label: "Obrigado", position: { x: 0, y: 0 }, config: { title: "Obrigado" } },
    ],
    edges: [
      { key: "1", source: "s", target: "c", sourceHandle: "next" },
      { key: "2", source: "c", target: "a", sourceHandle: "next" },
      { key: "3", source: "a", target: "u", sourceHandle: "next" },
      { key: "4", source: "u", target: "t", sourceHandle: "accept" },
      { key: "5", source: "u", target: "d", sourceHandle: "decline" },
      { key: "6", source: "d", target: "t", sourceHandle: "accept" },
      { key: "7", source: "d", target: "t", sourceHandle: "decline" },
    ],
  };
}

describe("validateFunnel", () => {
  it("funil completo é válido", () => {
    const v = validateFunnel(fullGraph(), refs);
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
  });

  it("deteta destino de recusa em falta no upsell", () => {
    const g = fullGraph();
    g.edges = g.edges.filter((e) => e.key !== "5");
    const v = validateFunnel(g, refs);
    expect(v.valid).toBe(false);
    expect(v.errors.some((e) => e.nodeKey === "u" && e.field === "decline")).toBe(true);
  });

  it("deteta ciclos", () => {
    const g = fullGraph();
    g.edges = g.edges.map((e) => (e.key === "6" ? { ...e, target: "u" } : e));
    const v = validateFunnel(g, refs);
    expect(v.errors.some((e) => e.message.includes("Ciclo"))).toBe(true);
  });

  it("deteta produto inexistente e arquivado, oferta errada e checkout inexistente", () => {
    const g = fullGraph();
    g.nodes[3].config = { productId: "nao-existe", offerId: "x", headline: "h" };
    g.nodes[4].config = { productId: "pA", offerId: "oA", headline: "h" };
    g.nodes[1].config = { checkoutId: "c-x" };
    const v = validateFunnel(g, refs);
    const msgs = v.errors.map((e) => e.message).join("\n");
    expect(msgs).toContain("não existe");
    expect(msgs).toContain("arquivado");
    expect(msgs).toContain("checkout selecionado não existe");
  });

  it("exige início, checkout e final; proíbe ligações inválidas", () => {
    const v = validateFunnel({ nodes: [], edges: [] });
    expect(v.errors).toHaveLength(3);
    const g = fullGraph();
    g.edges.push({ key: "x", source: "t", target: "s", sourceHandle: "next" });
    g.edges.push({ key: "y", source: "c", target: "c", sourceHandle: "next" });
    g.edges.push({ key: "z", source: "a", target: "t", sourceHandle: "next" });
    g.edges.push({ key: "w", source: "c", target: "ghost", sourceHandle: "next" });
    const v2 = validateFunnel(g, refs);
    const msgs = v2.errors.map((e) => e.message).join("\n");
    expect(msgs).toContain("não pode receber ligações");
    expect(msgs).toContain("si própria");
    expect(msgs).toContain("mais de um destino");
    expect(msgs).toContain("inexistente");
  });

  it("exige configuração das ofertas", () => {
    const g = fullGraph();
    g.nodes[3].config = {};
    const v = validateFunnel(g, refs);
    expect(v.errors.filter((e) => e.nodeKey === "u").map((e) => e.field)).toEqual(expect.arrayContaining(["productId", "offerId", "headline"]));
  });

  it("avisa sobre etapas não alcançáveis", () => {
    const g = fullGraph();
    g.nodes.push({ key: "orphan", type: "END", label: "Fim", position: { x: 0, y: 0 }, config: {} });
    const v = validateFunnel(g, refs);
    expect(v.valid).toBe(true);
    expect(v.warnings.some((w) => w.nodeKey === "orphan")).toBe(true);
  });
});

describe("simulatePath — upsell e downsell", () => {
  const g = fullGraph();
  it("aceitar upsell → obrigado", () => {
    expect(simulatePath(g, "c", ["accept"]).map((s) => s.key)).toEqual(["u", "t"]);
  });
  it("recusar upsell → downsell → aceitar → obrigado", () => {
    const p = simulatePath(g, "c", ["decline", "accept"]);
    expect(p.map((s) => `${s.key}:${s.decision ?? ""}`)).toEqual(["u:decline", "d:accept", "t:"]);
  });
  it("recusar upsell e downsell → obrigado", () => {
    expect(simulatePath(g, "c", ["decline", "decline"]).map((s) => s.key)).toEqual(["u", "d", "t"]);
  });
  it("sem downsell, recusa segue para a próxima etapa", () => {
    const g2 = fullGraph();
    g2.nodes = g2.nodes.filter((n) => n.key !== "d");
    g2.edges = g2.edges.filter((e) => e.source !== "d").map((e) => (e.key === "5" ? { ...e, target: "t" } : e));
    expect(simulatePath(g2, "c", ["decline"]).map((s) => s.key)).toEqual(["u", "t"]);
  });
  it("é protegido contra ciclos", () => {
    const g3 = fullGraph();
    g3.edges = g3.edges.map((e) => (e.key === "7" ? { ...e, target: "u" } : e));
    const p = simulatePath(g3, "c", Array(100).fill("decline"));
    expect(p.length).toBeLessThanOrEqual(50);
  });
});
