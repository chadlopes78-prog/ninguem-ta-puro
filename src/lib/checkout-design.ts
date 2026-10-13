// Design visual do checkout (editor de blocos).
// Contém APENAS apresentação. Preço, moeda, oferta, formulário de compra, pagamento e entrega
// nunca fazem parte do design e são sempre lidos do servidor.
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (#RRGGBB)");
const text = (max: number) => z.string().max(max, `Máximo de ${max} caracteres`);
const httpsUrl = z
  .string()
  .max(2000)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Use um endereço https://");
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

/** Plataformas de vídeo permitidas (incorporação segura). */
export function videoEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtube.com" || host === "m.youtube.com") {
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{6,20}$/.test(v)) return `https://www.youtube-nocookie.com/embed/${v}`;
      const m = /^\/(?:embed|shorts)\/([\w-]{6,20})/.exec(u.pathname);
      if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    }
    if (host === "youtu.be") {
      const m = /^\/([\w-]{6,20})/.exec(u.pathname);
      if (m) return `https://www.youtube-nocookie.com/embed/${m[1]}`;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const m = /(\d{5,12})/.exec(u.pathname);
      if (m) return `https://player.vimeo.com/video/${m[1]}`;
    }
  } catch {
    return null;
  }
  return null;
}

export const blockSchema = z.discriminatedUnion("type", [
  /** Cabeçalho do produto (imagem, nome, descrição e preço reais). Obrigatório, pode ser reposicionado. */
  z.object({ id, type: z.literal("product"), showImage: z.boolean().default(true), headline: text(140).default(""), subheadline: text(1000).default("") }),
  z.object({ id, type: z.literal("banner"), imageUrl: httpsUrl, alt: text(140).default(""), rounded: z.boolean().default(true) }),
  z.object({ id, type: z.literal("text"), title: text(140).default(""), body: text(3000).default(""), align: z.enum(["left", "center"]).default("left") }),
  z.object({
    id,
    type: z.literal("video"),
    url: httpsUrl.refine((v) => v === "" || videoEmbedUrl(v) !== null, "Use um link do YouTube ou do Vimeo"),
    caption: text(140).default(""),
  }),
  z.object({
    id,
    type: z.literal("testimonials"),
    title: text(140).default("O que dizem os nossos clientes"),
    items: z
      .array(z.object({ name: text(80), text: text(600), role: text(80).default(""), avatarUrl: httpsUrl.default(""), rating: z.number().int().min(0).max(5).default(5) }))
      .max(12),
  }),
  z.object({
    id,
    type: z.literal("countdown"),
    title: text(140).default("Oferta termina em"),
    /** fixed: termina numa data; evergreen: N minutos a partir da primeira visita do comprador */
    mode: z.enum(["fixed", "evergreen"]).default("evergreen"),
    endsAt: z.string().max(40).default(""),
    minutes: z.number().int().min(1).max(10080).default(15),
    expiredText: text(200).default("A oferta pode terminar a qualquer momento."),
  }),
  z.object({ id, type: z.literal("benefits"), title: text(140).default("O que vai receber"), items: z.array(text(200)).max(20) }),
  z.object({ id, type: z.literal("guarantee"), title: text(140).default("Garantia de satisfação"), body: text(1000).default(""), days: z.number().int().min(0).max(365).default(7) }),
  z.object({ id, type: z.literal("faq"), title: text(140).default("Perguntas frequentes"), items: z.array(z.object({ q: text(200), a: text(1000) })).max(20) }),
  z.object({ id, type: z.literal("image"), imageUrl: httpsUrl, alt: text(140).default(""), caption: text(200).default("") }),
  z.object({ id, type: z.literal("divider") }),
]);

export const designSchema = z
  .object({
    theme: z.object({
      primaryColor: hex,
      backgroundColor: hex,
      buttonText: z.string().trim().min(2, "Texto do botão obrigatório").max(40),
      layout: z.enum(["split", "stacked"]).default("split"),
      announcement: text(160).default(""),
      /** Tema visual: "dark" (Negrito/Escuro) ou "light" (Claro). Designs antigos derivam-no da cor de fundo. */
      mode: z.enum(["dark", "light"]).optional(),
    }),
    blocks: z.array(blockSchema).max(40, "Máximo de 40 elementos"),
  })
  .strip()
  .superRefine((d, ctx) => {
    if (d.blocks.filter((b) => b.type === "product").length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks"], message: "O cabeçalho do produto tem de existir exatamente uma vez." });
    }
    const ids = new Set<string>();
    for (const b of d.blocks) {
      if (ids.has(b.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks"], message: "Elementos com identificador repetido." });
      ids.add(b.id);
    }
  });

export type CheckoutDesign = z.infer<typeof designSchema>;
export type DesignBlock = CheckoutDesign["blocks"][number];
export type BlockType = DesignBlock["type"];

export const BLOCK_LABELS: Record<BlockType, { label: string; description: string }> = {
  product: { label: "Cabeçalho do produto", description: "Imagem, nome, descrição e preço reais" },
  banner: { label: "Banner", description: "Imagem de destaque" },
  text: { label: "Texto", description: "Título e parágrafo" },
  video: { label: "Vídeo", description: "YouTube ou Vimeo" },
  testimonials: { label: "Depoimentos", description: "Provas sociais de clientes" },
  countdown: { label: "Cronómetro", description: "Contagem decrescente" },
  benefits: { label: "Benefícios", description: "Lista do que o cliente recebe" },
  guarantee: { label: "Garantia", description: "Selo de garantia" },
  faq: { label: "Perguntas frequentes", description: "Respostas a dúvidas" },
  image: { label: "Imagem", description: "Imagem com legenda" },
  divider: { label: "Separador", description: "Linha divisória" },
};

export const ADDABLE_BLOCKS: Exclude<BlockType, "product">[] = ["banner", "text", "video", "testimonials", "countdown", "benefits", "guarantee", "faq", "image", "divider"];

export function newBlockId(): string {
  return `b${Math.random().toString(36).slice(2, 10)}`;
}

export function newBlock(type: Exclude<BlockType, "product">): DesignBlock {
  const id = newBlockId();
  switch (type) {
    case "banner":
      return { id, type, imageUrl: "", alt: "", rounded: true };
    case "text":
      return { id, type, title: "Título da secção", body: "Escreva aqui o seu texto.", align: "left" };
    case "video":
      return { id, type, url: "", caption: "" };
    case "testimonials":
      return { id, type, title: "O que dizem os nossos clientes", items: [{ name: "Nome do cliente", text: "O que o cliente disse sobre o produto.", role: "", avatarUrl: "", rating: 5 }] };
    case "countdown":
      return { id, type, title: "Oferta termina em", mode: "evergreen", endsAt: "", minutes: 15, expiredText: "A oferta pode terminar a qualquer momento." };
    case "benefits":
      return { id, type, title: "O que vai receber", items: ["Primeiro benefício", "Segundo benefício"] };
    case "guarantee":
      return { id, type, title: "Garantia de satisfação", body: "Se não ficar satisfeito, devolvemos o seu dinheiro.", days: 7 };
    case "faq":
      return { id, type, title: "Perguntas frequentes", items: [{ q: "Como recebo o produto?", a: "Recebe o acesso logo após a confirmação do pagamento." }] };
    case "image":
      return { id, type, imageUrl: "", alt: "", caption: "" };
    case "divider":
      return { id, type };
  }
}

/** Modelo padrão profissional, usado quando o produto ainda não tem personalização publicada. */
export function defaultDesign(theme: { primaryColor: string; backgroundColor: string; buttonText: string }): CheckoutDesign {
  return {
    theme: { primaryColor: theme.primaryColor, backgroundColor: theme.backgroundColor, buttonText: theme.buttonText, layout: "split", announcement: "" },
    blocks: [
      { id: "product", type: "product", showImage: true, headline: "", subheadline: "" },
      { id: "guarantee", type: "guarantee", title: "Compra segura", body: "O acesso é libertado assim que o pagamento for confirmado.", days: 0 },
    ],
  };
}

/** Lê um design guardado; se for inválido (ex.: versão antiga), devolve null para usar o padrão. */
export function parseDesign(value: unknown): CheckoutDesign | null {
  const r = designSchema.safeParse(value);
  return r.success ? r.data : null;
}

/** Predefinições de cada tema do checkout (o preço e o pagamento nunca dependem do tema). */
export const CHECKOUT_THEME_PRESETS = {
  dark: { backgroundColor: "#0B0C0E", primaryColor: "#C8F135" },
  light: { backgroundColor: "#F6F7F9", primaryColor: "#16A34A" },
} as const;

export function themeMode(theme: { mode?: "dark" | "light"; backgroundColor: string }): "dark" | "light" {
  if (theme.mode) return theme.mode;
  const m = /^#([0-9a-f]{6})$/i.exec(theme.backgroundColor);
  if (!m) return "dark";
  const n = parseInt(m[1], 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 140 ? "light" : "dark";
}
