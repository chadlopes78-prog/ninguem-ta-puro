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
    afterDecline: z.enum(["thank_you", "url"]).default("thank_you"),
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
    if (v.thankYou.action?.type === "product" && v.thankYou.action.delivery === "pdf" && !v.thankYou.fileId && !v.delivery.method) {
      ctx.addIssue({ code: "custom", path: ["thankYou", "fileId"], message: "Carregue ou selecione o PDF do produto" });
    }
  });
export type WizardInput = z.infer<typeof wizardSchema>;

export const WIZARD_KEYS = { start: "start", checkout: "checkout", upsell: "upsell", thankYou: "thank_you", end: "end" } as const;

/** Grafo equivalente à configuração do assistente. */
export function buildWizardGraph(input: { checkoutId: string; productName: string; afterPayment: "upsell" | "thank_you"; upsell?: UpsellConfig; thankYouTitle: string }): FunnelGraph {
  const K = WIZARD_KEYS;
  const node = (key: string, type: GraphNode["type"], label: string, x: number, config: StepConfig = {}): GraphNode => ({ key, type, label, position: { x, y: 0 }, config });
  const nodes: GraphNode[] = [
    node(K.start, "START", "Início", 0),
    node(K.checkout, "CHECKOUT", `Checkout — ${input.productName}`.slice(0, 80), 260, { checkoutId: input.checkoutId }),
  ];
  const edges: FunnelGraph["edges"] = [{ key: "e_start", source: K.start, target: K.checkout, sourceHandle: "next" }];
  if (input.afterPayment === "upsell" && input.upsell) {
    const u = input.upsell;
    nodes.push(
      node(K.upsell, "UPSELL", "Upsell", 520, {
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
        afterDecline: u.afterDecline,
        afterDeclineUrl: u.afterDecline === "url" ? u.afterDeclineUrl : undefined,
        afterFail: u.afterFail,
      }),
    );
    edges.push(
      { key: "e_checkout", source: K.checkout, target: K.upsell, sourceHandle: "next" },
      { key: "e_accept", source: K.upsell, target: K.thankYou, sourceHandle: "accept" },
      { key: "e_decline", source: K.upsell, target: K.thankYou, sourceHandle: "decline" },
    );
  } else {
    edges.push({ key: "e_checkout", source: K.checkout, target: K.thankYou, sourceHandle: "next" });
  }
  nodes.push(node(K.thankYou, "THANK_YOU", "Página de obrigado", 780, { title: input.thankYouTitle }), node(K.end, "END", "Fim", 1040));
  edges.push({ key: "e_end", source: K.thankYou, target: K.end, sourceHandle: "next" });
  return { nodes, edges };
}

/** Lê a configuração do upsell de um grafo do assistente (para voltar a editar). */
export function upsellFromGraph(graph: FunnelGraph): UpsellConfig | null {
  const n = graph.nodes.find((x) => x.type === "UPSELL");
  if (!n) return null;
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
