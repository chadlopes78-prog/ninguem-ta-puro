// Editor de funis por produto: "Compra principal → Upsells/Downsells (em sequência) → Página de obrigado".
// Converte a configuração no mesmo grafo usado pelo motor de funis (validação, ativação, percurso real),
// para que funis novos, antigos e do editor visual funcionem da mesma forma.
import { z } from "zod";
import { thankYouActionSchema, thankYouDesignSchema } from "@/lib/thank-you";
import { deliverySchema, supportSchema } from "@/lib/product-setup";
import type { FunnelGraph, GraphNode, StepConfig } from "./types";

const HTTPS_RE = /^https:\/\/[^\s.]+\.[^\s]+$/i;
const httpsUrl = z.string().trim().max(2000).refine((v) => HTTPS_RE.test(v), "Use um endereço https:// completo");
const optHttps = (msg = "Use um endereço https:// completo") => z.string().trim().max(2000).refine((v) => v === "" || HTTPS_RE.test(v), msg).default("");
const optText = (max: number) => z.string().trim().max(max).default("");
const id = z.string().regex(/^[a-z0-9]{10,40}$/i, "Seleção inválida");

/** Destino especial: página de obrigado do funil. */
export const THANK_YOU_TARGET = "thank_you";
/** Destino antigo (configurações anteriores): endereço externo fixo. Mantido, já não é oferecido no editor. */
export const URL_TARGET = "url";
const RESERVED_KEYS = new Set(["start", "checkout", "thank_you", "end", "url"]);
const STEP_KEY_RE = /^[a-z][a-z0-9_]{0,39}$/;

// ───────────── formato anterior (assistente com 1 upsell + 1 downsell) — continua aceite ─────────────

export const upsellConfigSchema = z
  .object({
    productId: id,
    offerId: id,
    headline: optText(160),
    body: optText(3000),
    imageUrl: optHttps("Use um endereço https://"),
    videoUrl: optHttps("Use um endereço https://"),
    acceptText: optText(60),
    declineText: optText(80),
    afterAccept: z.enum(["thank_you", "url"]).default("thank_you"),
    afterAcceptUrl: z.string().trim().max(2000).default(""),
    /** "downsell": ao recusar, mostra a oferta alternativa (só no upsell) */
    afterDecline: z.enum(["thank_you", "url", "downsell"]).default("thank_you"),
    afterDeclineUrl: z.string().trim().max(2000).default(""),
    afterFail: z.enum(["retry", "thank_you"]).default("thank_you"),
  })
  .strip();
export type UpsellConfig = z.infer<typeof upsellConfigSchema>;

// ───────────── formato atual: etapas de oferta em sequência ─────────────

export const funnelOfferSchema = z
  .object({
    /** Identificador estável da etapa no funil (ex.: upsell, downsell, upsell_2) */
    key: z.string().regex(STEP_KEY_RE, "Identificador inválido").refine((k) => !RESERVED_KEYS.has(k), "Identificador reservado"),
    type: z.enum(["UPSELL", "DOWNSELL"]),
    /** Nome interno da etapa (ex.: "Upsell 1 — Produto complementar") */
    name: z.string().trim().min(2, "Dê um nome à etapa").max(80),
    productId: id,
    /** Preço cobrado: vazio = preço principal do produto (resolvido no servidor) */
    offerId: z.union([id, z.literal("")]).default(""),
    /** Página externa da oferta (opcional). Vazio = página de oferta da plataforma. */
    pageUrl: optHttps(),
    acceptText: optText(60),
    declineText: optText(80),
    /** Destino depois de aceitar e o pagamento ser confirmado: outra etapa (mais à frente) ou obrigado */
    onAccept: z.string().max(40).default(THANK_YOU_TARGET),
    /** Destino depois de recusar */
    onDecline: z.string().max(40).default(THANK_YOU_TARGET),
    afterFail: z.enum(["retry", "thank_you"]).default("thank_you"),
    // Campos de configurações anteriores: preservados (deixaram de ser editados aqui)
    headline: optText(160),
    body: optText(3000),
    imageUrl: optHttps("Use um endereço https://"),
    videoUrl: optHttps("Use um endereço https://"),
    afterAcceptUrl: z.string().trim().max(2000).default(""),
    afterDeclineUrl: z.string().trim().max(2000).default(""),
  })
  .strip();
export type FunnelOffer = z.infer<typeof funnelOfferSchema>;
export type FunnelOfferInput = z.input<typeof funnelOfferSchema>;

const thankYouSchema = z.object({
  design: thankYouDesignSchema,
  action: thankYouActionSchema.nullish().transform((v) => v ?? undefined),
  fileId: z.string().max(40).nullable().default(null),
  /** Nome interno da etapa */
  stepName: z.string().trim().max(80).default("Página de obrigado"),
  /** true = página de obrigado da plataforma; false = destino externo (redirectUrl) */
  useSitePage: z.boolean().default(true),
  /** Com a página da plataforma: botão "Continuar" para este endereço. Sem ela: destino depois da compra. */
  redirectUrl: optHttps(),
});

/** Converte o formato anterior (afterPayment/upsell/downsell) para a lista de etapas. */
export function legacyToOffers(v: { afterPayment?: unknown; upsell?: unknown; downsell?: unknown }): FunnelOfferInput[] {
  if (v.afterPayment !== "upsell" || !v.upsell || typeof v.upsell !== "object") return [];
  const up = v.upsell as Record<string, unknown>;
  const down = v.downsell && typeof v.downsell === "object" ? (v.downsell as Record<string, unknown>) : null;
  const withDown = up.afterDecline === "downsell" && !!down;
  const conv = (o: Record<string, unknown>, key: string, type: "UPSELL" | "DOWNSELL", decline: string): FunnelOfferInput => ({
    productId: String(o.productId ?? ""),
    ...(o as object),
    key,
    type,
    name: type === "UPSELL" ? "Upsell" : "Downsell",
    onAccept: o.afterAccept === "url" ? URL_TARGET : THANK_YOU_TARGET,
    onDecline: decline,
  });
  const out = [conv(up, "upsell", "UPSELL", withDown ? "downsell" : up.afterDecline === "url" ? URL_TARGET : THANK_YOU_TARGET)];
  if (withDown) out.push(conv(down!, "downsell", "DOWNSELL", down!.afterDecline === "url" ? URL_TARGET : THANK_YOU_TARGET));
  return out;
}

export const wizardSchema = z
  .preprocess(
    (raw) => {
      if (!raw || typeof raw !== "object") return raw;
      const r = raw as Record<string, unknown>;
      // pedidos no formato anterior continuam a funcionar
      if (r.offers === undefined && "afterPayment" in r) {
        if (r.afterPayment === "upsell" && !r.upsell) return { ...r, offers: undefined, _missingUpsell: true };
        if (r.afterPayment === "upsell" && (r.upsell as Record<string, unknown> | undefined)?.afterDecline === "downsell" && !r.downsell) return { ...r, offers: legacyToOffers({ ...r, downsell: undefined }), _missingDownsell: true };
        return { ...r, offers: legacyToOffers(r) };
      }
      return r;
    },
    z.object({
      name: z.string().trim().min(2, "Dê um nome ao funil").max(100),
      productId: id,
      offers: z.array(funnelOfferSchema).max(10, "Máximo de 10 ofertas por funil").default([]),
      thankYou: thankYouSchema,
      /** Suporte via WhatsApp do produto inicial */
      support: supportSchema.default({}),
      /** Entrega do produto inicial: link externo OU página de entrega interna */
      delivery: deliverySchema.default({}),
      /** Este funil passa a ser o principal do produto (o que o checkout principal segue) */
      isMain: z.boolean().default(true),
      _missingUpsell: z.boolean().optional(),
      _missingDownsell: z.boolean().optional(),
    }),
  )
  .superRefine((v, ctx) => {
    if (v._missingUpsell) ctx.addIssue({ code: "custom", path: ["upsell"], message: "Configure o upsell" });
    if (v._missingDownsell) ctx.addIssue({ code: "custom", path: ["downsell"], message: "Configure o downsell" });
    const keys = v.offers.map((o) => o.key);
    const reachable = new Set<string>(v.offers[0] ? [v.offers[0].key] : []);
    v.offers.forEach((o, i) => {
      const at = (f: string) => ["offers", i, f];
      if (keys.indexOf(o.key) !== i) ctx.addIssue({ code: "custom", path: at("key"), message: "Etapa repetida" });
      if (o.productId === v.productId) ctx.addIssue({ code: "custom", path: at("productId"), message: "Escolha um produto diferente do produto principal" });
      for (const [field, target, url] of [["onAccept", o.onAccept, o.afterAcceptUrl], ["onDecline", o.onDecline, o.afterDeclineUrl]] as const) {
        if (target === THANK_YOU_TARGET) continue;
        if (target === URL_TARGET) {
          if (!httpsUrl.safeParse(url).success) ctx.addIssue({ code: "custom", path: at(field === "onAccept" ? "afterAcceptUrl" : "afterDeclineUrl"), message: "Introduza um endereço https:// completo" });
          continue;
        }
        const j = keys.indexOf(target);
        // só para etapas seguintes: impede ciclos e saltos para trás
        if (j <= i) ctx.addIssue({ code: "custom", path: at(field), message: "Escolha uma etapa seguinte ou a página de obrigado" });
        else if (reachable.has(o.key)) reachable.add(target);
      }
    });
    v.offers.forEach((o, i) => {
      if (!reachable.has(o.key)) ctx.addIssue({ code: "custom", path: ["offers", i, "key"], message: `“${o.name}” não está ligada a nenhuma etapa anterior: escolha-a como destino de aceitar ou recusar.` });
    });
    if (!v.thankYou.useSitePage && !v.thankYou.redirectUrl) ctx.addIssue({ code: "custom", path: ["thankYou", "redirectUrl"], message: "Indique o endereço da página de obrigado externa" });
    if (v.thankYou.action?.type === "product" && v.thankYou.action.delivery === "pdf" && !v.thankYou.fileId && !v.delivery.method) {
      ctx.addIssue({ code: "custom", path: ["thankYou", "fileId"], message: "Carregue ou selecione o PDF do produto" });
    }
  });
export type WizardInput = z.infer<typeof wizardSchema>;

export const WIZARD_KEYS = { start: "start", checkout: "checkout", upsell: "upsell", downsell: "downsell", thankYou: "thank_you", end: "end" } as const;

/** Configuração de uma etapa de oferta no formato do motor de funis (offerId já resolvido). */
function offerStepConfig(o: FunnelOffer): StepConfig {
  return {
    productId: o.productId,
    offerId: o.offerId,
    pageUrl: o.pageUrl || undefined,
    headline: o.headline || undefined,
    body: o.body || undefined,
    imageUrl: o.imageUrl || undefined,
    videoUrl: o.videoUrl || undefined,
    acceptText: o.acceptText || undefined,
    declineText: o.declineText || undefined,
    afterAccept: o.onAccept === URL_TARGET ? "url" : "thank_you",
    afterAcceptUrl: o.onAccept === URL_TARGET ? o.afterAcceptUrl : undefined,
    // destinos para outras etapas são ligações do grafo; "url" é um destino fixo antigo
    afterDecline: o.onDecline === URL_TARGET ? "url" : "thank_you",
    afterDeclineUrl: o.onDecline === URL_TARGET ? o.afterDeclineUrl : undefined,
    afterFail: o.afterFail,
  };
}

export interface ThankYouStep {
  title: string;
  stepName: string;
  useSitePage: boolean;
  redirectUrl: string;
}

/** Grafo equivalente à configuração do editor (as etapas ficam pela ordem da lista). */
export function buildWizardGraph(input: { checkoutId: string; productName: string; offers: FunnelOffer[]; thankYou: ThankYouStep }): FunnelGraph {
  const K = WIZARD_KEYS;
  const node = (key: string, type: GraphNode["type"], label: string, x: number, config: StepConfig = {}): GraphNode => ({ key, type, label, position: { x, y: 0 }, config });
  const nodes: GraphNode[] = [node(K.start, "START", "Início", 0), node(K.checkout, "CHECKOUT", `Compra principal — ${input.productName}`.slice(0, 80), 260, { checkoutId: input.checkoutId })];
  const edges: FunnelGraph["edges"] = [
    { key: "e_start", source: K.start, target: K.checkout, sourceHandle: "next" },
    { key: "e_checkout", source: K.checkout, target: input.offers[0]?.key ?? K.thankYou, sourceHandle: "next" },
  ];
  const target = (t: string) => (t === THANK_YOU_TARGET || t === URL_TARGET ? K.thankYou : t);
  input.offers.forEach((o, i) => {
    nodes.push(node(o.key, o.type, o.name, 520 + i * 260, offerStepConfig(o)));
    edges.push(
      { key: `e_${o.key}_accept`, source: o.key, target: target(o.onAccept), sourceHandle: "accept" },
      { key: `e_${o.key}_decline`, source: o.key, target: target(o.onDecline), sourceHandle: "decline" },
    );
  });
  const x = 520 + input.offers.length * 260;
  const ty = input.thankYou;
  nodes.push(
    node(K.thankYou, "THANK_YOU", (ty.stepName || "Página de obrigado").slice(0, 80), x, { title: ty.title, useSitePage: ty.useSitePage, redirectUrl: ty.redirectUrl || undefined }),
    node(K.end, "END", "Fim", x + 260),
  );
  edges.push({ key: "e_end", source: K.thankYou, target: K.end, sourceHandle: "next" });
  return { nodes, edges };
}

/** Lê as etapas de oferta de um grafo (pela ordem no funil), para voltar a editar. */
export function offersFromGraph(graph: FunnelGraph): FunnelOffer[] {
  const offerNodes = graph.nodes.filter((n) => n.type === "UPSELL" || n.type === "DOWNSELL" || n.type === "ORDER_BUMP").sort((a, b) => a.position.x - b.position.x);
  const keys = new Set(offerNodes.map((n) => n.key));
  const dest = (n: GraphNode, handle: "accept" | "decline") => {
    const isUrl = handle === "accept" ? n.config.afterAccept === "url" : n.config.afterDecline === "url";
    if (isUrl) return URL_TARGET;
    const t = graph.edges.find((e) => e.source === n.key && e.sourceHandle === handle)?.target;
    return t && keys.has(t) ? t : THANK_YOU_TARGET;
  };
  return offerNodes.map((n) => {
    const c = n.config;
    return {
      key: n.key,
      type: n.type === "DOWNSELL" ? "DOWNSELL" : "UPSELL",
      name: n.label || (n.type === "DOWNSELL" ? "Downsell" : "Upsell"),
      productId: c.productId ?? "",
      offerId: c.offerId ?? "",
      pageUrl: c.pageUrl ?? "",
      acceptText: c.acceptText ?? "",
      declineText: c.declineText ?? "",
      onAccept: dest(n, "accept"),
      onDecline: dest(n, "decline"),
      afterFail: c.afterFail ?? "thank_you",
      headline: c.headline ?? "",
      body: c.body ?? "",
      imageUrl: c.imageUrl ?? "",
      videoUrl: c.videoUrl ?? "",
      afterAcceptUrl: c.afterAcceptUrl ?? "",
      afterDeclineUrl: c.afterDeclineUrl ?? "",
    };
  });
}

/** Configuração da etapa de obrigado guardada no grafo. */
export function thankYouStepFromGraph(graph: FunnelGraph): Omit<ThankYouStep, "title"> {
  const n = graph.nodes.find((x) => x.type === "THANK_YOU");
  return { stepName: n?.label ?? "Página de obrigado", useSitePage: n?.config.useSitePage !== false, redirectUrl: n?.config.redirectUrl ?? "" };
}

function toLegacy(o: FunnelOffer, declineToDownsell: boolean): UpsellConfig {
  return {
    productId: o.productId,
    offerId: o.offerId,
    headline: o.headline,
    body: o.body,
    imageUrl: o.imageUrl,
    videoUrl: o.videoUrl,
    acceptText: o.acceptText,
    declineText: o.declineText,
    afterAccept: o.onAccept === URL_TARGET ? "url" : "thank_you",
    afterAcceptUrl: o.afterAcceptUrl,
    afterDecline: o.onDecline === URL_TARGET ? "url" : declineToDownsell ? "downsell" : "thank_you",
    afterDeclineUrl: o.afterDeclineUrl,
    afterFail: o.afterFail,
  };
}

/** Primeiro upsell no formato anterior (compatibilidade). */
export function upsellFromGraph(graph: FunnelGraph): UpsellConfig | null {
  const offers = offersFromGraph(graph);
  const up = offers[0];
  if (!up) return null;
  const target = offers.find((o) => o.key === up.onDecline);
  return toLegacy(up, target?.type === "DOWNSELL");
}

/** Primeiro downsell no formato anterior (compatibilidade). */
export function downsellFromGraph(graph: FunnelGraph): UpsellConfig | null {
  const d = offersFromGraph(graph).find((o) => o.type === "DOWNSELL");
  return d ? toLegacy(d, false) : null;
}
