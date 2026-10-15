// Assistente de funis: "Produto inicial → (Upsell) → Página de obrigado".
// Converte a configuração por etapas no mesmo grafo usado pelo motor de funis (validação, ativação, demo),
// para que funis do assistente e do editor avançado funcionem da mesma forma.
import { z } from "zod";
import { thankYouActionSchema, thankYouDesignSchema } from "@/lib/thank-you";
import { deliverySchema, supportSchema } from "@/lib/product-setup";
import type { FunnelGraph, GraphNode, StepConfig } from "./types";

const httpsUrl = z.string().trim().max(2000).refine((v) => /^https:\/\/[^\s.]+\.[^\s]+$/i.test(v), "Use um endereço https:// completo");
const optText = (max: number) => z.string().trim().max(max).default("");
const id = z.string().regex(/^[a-z0-9]{10,40}$/i, "Seleção inválida");

export const upsellConfigSchema = z
  .object({
    productId: id,
    offerId: id,
    headline: z.string().trim().min(3, "Escreva o título da oferta").max(160),
    body: optText(3000),
    imageUrl: z.string().trim().max(2000).refine((v) => v === "" || /^https:\/\//i.test(v), "Use um endereço https://").default(""),
    videoUrl: z.string().trim().max(2000).refine((v) => v === "" || /^https:\/\//i.test(v), "Use um endereço https://").default(""),
    acceptText: optText(60),
    declineText: optText(80),
    afterAccept: z.enum(["thank_you", "url"]).default("thank_you"),
    afterAcceptUrl: z.string().trim().max(2000).default(""),
    /** "downsell": ao recusar, mostra a oferta alternativa (só no upsell) */
    afterDecline: z.enum(["thank_you", "url", "downsell"]).default("thank_you"),
    afterDeclineUrl: z.string().trim().max(2000).default(""),
    afterFail: z.enum(["retry", "thank_you"]).default("thank_you"),
  })
  .strip()
  .superRefine((v, ctx) => {
    if (v.afterAccept === "url" && !httpsUrl.safeParse(v.afterAcceptUrl).success) ctx.addIssue({ code: "custom", path: ["afterAcceptUrl"], message: "Introduza um endereço https:// completo" });
    if (v.afterDecline === "url" && !httpsUrl.safeParse(v.afterDeclineUrl).success) ctx.addIssue({ code: "custom", path: ["afterDeclineUrl"], message: "Introduza um endereço https:// completo" });
  });
export type UpsellConfig = z.infer<typeof upsellConfigSchema>;

export const wizardSchema = z
  .object({
    name: z.string().trim().min(2, "Dê um nome ao funil").max(100),
    productId: id,
    afterPayment: z.enum(["upsell", "thank_you"]),
    upsell: upsellConfigSchema.optional(),
    /** Oferta alternativa mostrada quando o cliente recusa o upsell (mesmo motor de funis: etapa DOWNSELL) */
    downsell: upsellConfigSchema.optional(),
    // `action`/`fileId`: configuração anterior do botão da página de obrigado (mantida por compatibilidade;
    // o botão de acesso passa a seguir a entrega do produto e o WhatsApp o suporte do produto)
    thankYou: z.object({ design: thankYouDesignSchema, action: thankYouActionSchema.optional(), fileId: z.string().max(40).nullable().default(null) }),
    /** Suporte via WhatsApp do produto inicial */
    support: supportSchema.default({}),
    /** Entrega do produto inicial: link externo OU página de entrega interna */
    delivery: deliverySchema.default({}),
    /** Este funil passa a ser o principal do produto (o que o checkout principal segue) */
    isMain: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.afterPayment === "upsell" && !v.upsell) ctx.addIssue({ code: "custom", path: ["upsell"], message: "Configure o upsell" });
    if (v.upsell && v.upsell.productId === v.productId) ctx.addIssue({ code: "custom", path: ["upsell", "productId"], message: "Escolha um produto diferente do produto inicial" });
    if (v.afterPayment === "upsell" && v.upsell?.afterDecline === "downsell") {
      if (!v.downsell) ctx.addIssue({ code: "custom", path: ["downsell"], message: "Configure o downsell" });
      else if (v.downsell.productId === v.productId) ctx.addIssue({ code: "custom", path: ["downsell", "productId"], message: "Escolha um produto diferente do produto inicial" });
    }
    if (v.downsell?.afterDecline === "downsell") ctx.addIssue({ code: "custom", path: ["downsell", "afterDecline"], message: "Escolha o destino depois de recusar o downsell" });
    if (v.thankYou.action?.type === "product" && v.thankYou.action.delivery === "pdf" && !v.thankYou.fileId && !v.delivery.method) {
      ctx.addIssue({ code: "custom", path: ["thankYou", "fileId"], message: "Carregue ou selecione o PDF do produto" });
    }
  });
export type WizardInput = z.infer<typeof wizardSchema>;

export const WIZARD_KEYS = { start: "start", checkout: "checkout", upsell: "upsell", downsell: "downsell", thankYou: "thank_you", end: "end" } as const;

/** Configuração de uma etapa de oferta (upsell/downsell) no formato do motor de funis. */
function offerStepConfig(u: UpsellConfig): StepConfig {
  return {
    productId: u.productId,
    offerId: u.offerId,
    headline: u.headline,
    body: u.body || undefined,
    imageUrl: u.imageUrl || undefined,
    videoUrl: u.videoUrl || undefined,
    acceptText: u.acceptText || undefined,
    declineText: u.declineText || undefined,
    afterAccept: u.afterAccept,
    afterAcceptUrl: u.afterAccept === "url" ? u.afterAcceptUrl : undefined,
    // "downsell" é uma ligação do grafo (recusa → etapa DOWNSELL), não um destino: o motor segue a ligação
    afterDecline: u.afterDecline === "url" ? "url" : "thank_you",
    afterDeclineUrl: u.afterDecline === "url" ? u.afterDeclineUrl : undefined,
    afterFail: u.afterFail,
  };
}

/** Grafo equivalente à configuração do assistente. */
export function buildWizardGraph(input: { checkoutId: string; productName: string; afterPayment: "upsell" | "thank_you"; upsell?: UpsellConfig; downsell?: UpsellConfig; thankYouTitle: string }): FunnelGraph {
  const K = WIZARD_KEYS;
  const node = (key: string, type: GraphNode["type"], label: string, x: number, config: StepConfig = {}): GraphNode => ({ key, type, label, position: { x, y: 0 }, config });
  const nodes: GraphNode[] = [
    node(K.start, "START", "Início", 0),
    node(K.checkout, "CHECKOUT", `Checkout — ${input.productName}`.slice(0, 80), 260, { checkoutId: input.checkoutId }),
  ];
  const edges: FunnelGraph["edges"] = [{ key: "e_start", source: K.start, target: K.checkout, sourceHandle: "next" }];
  if (input.afterPayment === "upsell" && input.upsell) {
    const withDownsell = input.upsell.afterDecline === "downsell" && !!input.downsell;
    nodes.push(node(K.upsell, "UPSELL", "Upsell", 520, offerStepConfig(input.upsell)));
    edges.push(
      { key: "e_checkout", source: K.checkout, target: K.upsell, sourceHandle: "next" },
      { key: "e_accept", source: K.upsell, target: K.thankYou, sourceHandle: "accept" },
      { key: "e_decline", source: K.upsell, target: withDownsell ? K.downsell : K.thankYou, sourceHandle: "decline" },
    );
    if (withDownsell) {
      nodes.push(node(K.downsell, "DOWNSELL", "Downsell", 650, offerStepConfig({ ...input.downsell!, afterDecline: input.downsell!.afterDecline === "url" ? "url" : "thank_you" })));
      edges.push(
        { key: "e_down_accept", source: K.downsell, target: K.thankYou, sourceHandle: "accept" },
        { key: "e_down_decline", source: K.downsell, target: K.thankYou, sourceHandle: "decline" },
      );
    }
  } else {
    edges.push({ key: "e_checkout", source: K.checkout, target: K.thankYou, sourceHandle: "next" });
  }
  nodes.push(node(K.thankYou, "THANK_YOU", "Página de obrigado", 780, { title: input.thankYouTitle }), node(K.end, "END", "Fim", 1040));
  edges.push({ key: "e_end", source: K.thankYou, target: K.end, sourceHandle: "next" });
  return { nodes, edges };
}

function offerFromNode(n: GraphNode): UpsellConfig {
  const c = n.config;
  return {
    productId: c.productId ?? "",
    offerId: c.offerId ?? "",
    headline: c.headline ?? "",
    body: c.body ?? "",
    imageUrl: c.imageUrl ?? "",
    videoUrl: c.videoUrl ?? "",
    acceptText: c.acceptText ?? "",
    declineText: c.declineText ?? "",
    afterAccept: c.afterAccept ?? "thank_you",
    afterAcceptUrl: c.afterAcceptUrl ?? "",
    afterDecline: c.afterDecline ?? "thank_you",
    afterDeclineUrl: c.afterDeclineUrl ?? "",
    afterFail: c.afterFail ?? "thank_you",
  };
}

/** Lê a configuração do upsell de um grafo do assistente (para voltar a editar). */
export function upsellFromGraph(graph: FunnelGraph): UpsellConfig | null {
  const n = graph.nodes.find((x) => x.type === "UPSELL");
  if (!n) return null;
  const u = offerFromNode(n);
  // recusa ligada a uma etapa de downsell → "mostrar downsell"
  const decline = graph.edges.find((e) => e.source === n.key && e.sourceHandle === "decline");
  if (decline && graph.nodes.find((x) => x.key === decline.target)?.type === "DOWNSELL" && u.afterDecline !== "url") u.afterDecline = "downsell";
  return u;
}

/** Lê o downsell (etapa mostrada depois de recusar o upsell). */
export function downsellFromGraph(graph: FunnelGraph): UpsellConfig | null {
  const n = graph.nodes.find((x) => x.type === "DOWNSELL");
  return n ? offerFromNode(n) : null;
}
