// Design visual do checkout (editor tipo Elementor): secções → colunas → elementos, com estilos controlados.
// Contém APENAS apresentação. Preço, moeda, oferta, formulário de compra, pagamento e entrega nunca fazem
// parte do design: são sempre lidos do servidor. O formulário de compra é um elemento protegido ("checkout")
// que existe exatamente uma vez e usa sempre a implementação real (validação, encomenda, EPay/E2Payments).
//
// Segurança: tudo o que o utilizador escreve é texto simples (o React escapa-o) e os estilos são valores
// validados (cores #RRGGBB, números com limites, listas fechadas). Não há HTML, CSS livre nem scripts.
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (#RRGGBB)");
const optHex = z.union([hex, z.literal("")]).default("");
const text = (max: number) => z.string().max(max, `Máximo de ${max} caracteres`);
const httpsUrl = z
  .string()
  .max(2000)
  .refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/i.test(v), "Use um endereço https://");
/** Imagem: endereço https:// ou imagem carregada para a biblioteca da conta (/api/public/media/<id>). */
export const MEDIA_PATH = /^\/api\/public\/media\/([a-z0-9]{20,40})$/;
const imageSrc = z
  .string()
  .max(2000)
  .refine((v) => v === "" || MEDIA_PATH.test(v) || /^https:\/\/[^\s"'<>]+$/i.test(v), "Use uma imagem da biblioteca ou um endereço https://");
const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);
const num = (min: number, max: number) => z.number().finite().min(min).max(max);

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

// ───────────────────────────── estilos ─────────────────────────────

export const FONT_FAMILIES = {
  inherit: { label: "Do tema", css: "inherit" },
  inter: { label: "Inter (moderna)", css: "var(--font-sans)" },
  grotesk: { label: "Space Grotesk (títulos)", css: "var(--font-display)" },
  serif: { label: "Serifada (clássica)", css: "Georgia, 'Times New Roman', serif" },
  system: { label: "Do sistema", css: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" },
  mono: { label: "Monoespaçada", css: "ui-monospace, 'SFMono-Regular', Menlo, monospace" },
} as const;
export type FontFamily = keyof typeof FONT_FAMILIES;
const fontFamily = z.enum(["inherit", "inter", "grotesk", "serif", "system", "mono"]);
const themeFont = z.enum(["inter", "grotesk", "serif", "system", "mono"]);

/** Estilos comuns a todos os elementos (todos opcionais; vazio = predefinição do elemento). */
export const styleSchema = z
  .object({
    fontFamily: fontFamily.optional(),
    fontSize: num(10, 96).optional(),
    fontSizeMobile: num(10, 72).optional(),
    fontWeight: z.union([z.literal(300), z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).optional(),
    color: hex.optional(),
    align: z.enum(["left", "center", "right"]).optional(),
    lineHeight: num(0.9, 2.6).optional(),
    letterSpacing: num(-3, 12).optional(),
    marginTop: num(0, 240).optional(),
    marginBottom: num(0, 240).optional(),
    paddingY: num(0, 160).optional(),
    paddingX: num(0, 160).optional(),
    maxWidth: num(0, 1600).optional(),
    background: hex.optional(),
    radius: num(0, 48).optional(),
    borderColor: hex.optional(),
    borderWidth: num(0, 8).optional(),
    hideDesktop: z.boolean().optional(),
    hideMobile: z.boolean().optional(),
  })
  .strip();
export type ElementStyle = z.infer<typeof styleSchema>;

const base = { id, style: styleSchema.default({}) };
const aspect = z.enum(["auto", "1/1", "4/3", "3/2", "16/9", "21/9", "3/1", "3/4"]);
export const ICONS = ["check", "shield", "lock", "star", "clock", "gift", "truck", "download", "phone", "heart", "award", "info", "zap", "users"] as const;
const icon = z.enum(ICONS);

export const elementSchema = z.discriminatedUnion("type", [
  /** Título: texto próprio ou o nome real do produto (acompanha mudanças de nome). */
  z.object({ ...base, type: z.literal("heading"), source: z.enum(["custom", "productName"]).default("custom"), text: text(200).default(""), level: z.enum(["h1", "h2", "h3"]).default("h2") }),
  z.object({ ...base, type: z.literal("subtitle"), text: text(400).default("") }),
  /** Texto: próprio ou a descrição real do produto. */
  z.object({ ...base, type: z.literal("text"), source: z.enum(["custom", "productDescription"]).default("custom"), text: text(5000).default("") }),
  z.object({
    ...base,
    type: z.literal("image"),
    /** custom: imagem escolhida; product: imagem atual do produto */
    source: z.enum(["custom", "product"]).default("custom"),
    src: imageSrc.default(""),
    alt: text(160).default(""),
    caption: text(200).default(""),
    widthPct: num(10, 100).default(100),
    mobileWidthPct: num(10, 100).default(100),
    maxWidthPx: num(0, 2400).default(0),
    aspect: aspect.default("auto"),
    heightPx: num(0, 1200).default(0),
    fit: z.enum(["cover", "contain"]).default("cover"),
    focusX: num(0, 100).default(50),
    focusY: num(0, 100).default(50),
    imgRadius: num(0, 48).default(16),
    imgAlign: z.enum(["left", "center", "right"]).default("center"),
  }),
  z.object({
    ...base,
    type: z.literal("banner"),
    src: imageSrc.default(""),
    alt: text(160).default(""),
    title: text(160).default(""),
    subtitle: text(300).default(""),
    aspect: z.enum(["21/9", "3/1", "16/9", "4/3"]).default("3/1"),
    overlay: num(0, 85).default(35),
    textColor: hex.default("#FFFFFF"),
    focusX: num(0, 100).default(50),
    focusY: num(0, 100).default(50),
    imgRadius: num(0, 48).default(16),
  }),
  z.object({
    ...base,
    type: z.literal("video"),
    url: httpsUrl.refine((v) => v === "" || videoEmbedUrl(v) !== null, "Use um link do YouTube ou do Vimeo").default(""),
    caption: text(160).default(""),
  }),
  z.object({ ...base, type: z.literal("benefits"), title: text(160).default(""), items: z.array(text(240)).max(24).default([]), icon: icon.default("check") }),
  z.object({
    ...base,
    type: z.literal("testimonials"),
    title: text(160).default(""),
    items: z
      .array(z.object({ name: text(80), text: text(700), role: text(80).default(""), avatarUrl: imageSrc.default(""), rating: z.number().int().min(0).max(5).default(5) }))
      .max(12)
      .default([]),
    /** cards: cartões com fotografia; compact: estrelas, comentário e nome (modelo PayGate) */
    variant: z.enum(["cards", "compact"]).default("cards"),
  }),
  z.object({ ...base, type: z.literal("guarantee"), title: text(160).default(""), body: text(1200).default(""), days: z.number().int().min(0).max(365).default(7) }),
  z.object({ ...base, type: z.literal("faq"), title: text(160).default(""), items: z.array(z.object({ q: text(240), a: text(1200) })).max(24).default([]) }),
  z.object({
    ...base,
    type: z.literal("countdown"),
    title: text(160).default(""),
    /** fixed: termina numa data; evergreen: N minutos a partir da primeira visita do comprador. Só visual. */
    mode: z.enum(["fixed", "evergreen"]).default("evergreen"),
    endsAt: z.string().max(40).default(""),
    minutes: z.number().int().min(1).max(10080).default(15),
    expiredText: text(200).default(""),
    /** Cor que preenche TODO o componente (vazio = cor do cronómetro do tema ou aspeto neutro). */
    bgColor: optHex,
    /** Cor dos números e do texto (vazio = branco/escuro automático conforme o fundo). */
    textColor: optHex,
    size: z.enum(["sm", "md", "lg"]).default("md"),
    /** boxes: caixas por unidade; banner: cartão com «03:18» grande (modelo PayGate) */
    variant: z.enum(["boxes", "banner"]).default("boxes"),
  }),
  z.object({ ...base, type: z.literal("infoBox"), icon: icon.default("info"), title: text(160).default(""), body: text(1200).default(""), layout: z.enum(["row", "column"]).default("row") }),
  /** Elementos de confiança configurados pelo utilizador (nenhum texto é imposto pela plataforma). */
  z.object({
    ...base,
    type: z.literal("trust"),
    items: z.array(z.object({ icon, text: text(80) })).max(8).default([]),
    layout: z.enum(["row", "column"]).default("row"),
    /** accent: ícones na cor principal; muted: discreto e pequeno (ex.: «Checkout seguro · PayGate») */
    tone: z.enum(["accent", "muted"]).default("accent"),
  }),
  /** Cartão do produto: imagem larga com texto sobreposto, nome e preço reais. */
  z.object({
    ...base,
    type: z.literal("productCard"),
    imageSource: z.enum(["product", "custom"]).default("product"),
    src: imageSrc.default(""),
    overlayText: text(80).default(""),
    showOverlay: z.boolean().default(true),
    overlayPosition: z.enum(["top-left", "top-center", "top-right", "center", "bottom-left", "bottom-center", "bottom-right"]).default("top-left"),
    showName: z.boolean().default(true),
    showPrice: z.boolean().default(true),
    focusX: num(0, 100).default(50),
    focusY: num(0, 100).default(50),
  }),
  /**
   * Prova social. real: compras pagas nas últimas 24 h e visitantes nos últimos 5 minutos deste checkout (dados
   * verificáveis da plataforma; esconde-se quando não há); custom: números indicados pelo vendedor.
   */
  z.object({
    ...base,
    type: z.literal("socialProof"),
    mode: z.enum(["real", "custom"]).default("real"),
    purchasesText: text(120).default("{n} pessoas compraram nas últimas 24h"),
    viewersText: text(60).default("{n} a ver agora"),
    customPurchases: z.number().int().min(0).max(100000).default(0),
    customViewers: z.number().int().min(0).max(100000).default(0),
    showViewers: z.boolean().default(true),
  }),
  /** Resumo do produto com dados reais (imagem, nome, oferta, preço). */
  z.object({ ...base, type: z.literal("productSummary"), showImage: z.boolean().default(true), showDescription: z.boolean().default(false) }),
  /** Preço real da oferta (nunca editável). */
  z.object({ ...base, type: z.literal("price"), label: text(60).default(""), showCompareAt: z.boolean().default(true) }),
  /** Botão: só leva ao formulário de compra ou abre um link https. Nunca simula uma compra. */
  z.object({
    ...base,
    type: z.literal("button"),
    label: text(60).default("Comprar agora"),
    action: z.enum(["scrollToCheckout", "link"]).default("scrollToCheckout"),
    url: httpsUrl.default(""),
    fullWidth: z.boolean().default(false),
    size: z.enum(["sm", "md", "lg"]).default("md"),
    variant: z.enum(["solid", "outline"]).default("solid"),
  }),
  z.object({ ...base, type: z.literal("spacer"), height: num(4, 240).default(32), mobileHeight: num(0, 240).default(24) }),
  z.object({ ...base, type: z.literal("divider"), thickness: num(1, 8).default(1), widthPct: num(5, 100).default(100), line: z.enum(["solid", "dashed", "dotted"]).default("solid"), lineColor: optHex }),
  /** Formulário de compra + pagamento + resumo da encomenda (implementação real). Protegido. */
  z.object({
    ...base,
    type: z.literal("checkout"),
    title: text(80).default("Os seus dados"),
    subtitle: text(200).default("Usados para enviar o acesso ao produto."),
    stickyDesktop: z.boolean().default(true),
    /** classic: formulário anterior; card: cartão com o número em destaque e métodos em cartões (modelo PayGate) */
    variant: z.enum(["classic", "card"]).default("classic"),
    phoneTitle: text(80).default("Número para fazer o pagamento"),
    phoneHint: text(160).default("Detectamos automaticamente M-Pesa ou e-Mola."),
    phoneNote: text(160).default("Nunca partilhamos o seu número. Débito seguro e instantâneo."),
    /** Selos por baixo do botão de pagamento (variante card) */
    securityItems: z.array(z.object({ icon, text: text(60) })).max(4).default([]),
    consentText: text(200).default(""),
  }),
]);
export type DesignElement = z.infer<typeof elementSchema>;
export type ElementType = DesignElement["type"];

export const SECTION_LAYOUTS = {
  "1": { label: "1 coluna", cols: [1] },
  "1-1": { label: "2 colunas iguais", cols: [1, 1] },
  "3-2": { label: "2 colunas (60/40)", cols: [3, 2] },
  "2-3": { label: "2 colunas (40/60)", cols: [2, 3] },
  "2-1": { label: "2 colunas (66/33)", cols: [2, 1] },
  "1-2": { label: "2 colunas (33/66)", cols: [1, 2] },
  "1-1-1": { label: "3 colunas", cols: [1, 1, 1] },
} as const;
export type SectionLayout = keyof typeof SECTION_LAYOUTS;
export const CONTENT_WIDTHS = { compact: { label: "Telemóvel (520 px)", px: 520 }, narrow: { label: "Estreita (680 px)", px: 680 }, normal: { label: "Normal (960 px)", px: 960 }, wide: { label: "Larga (1160 px)", px: 1160 }, full: { label: "Ecrã inteiro", px: 0 } } as const;

export const sectionSchema = z.object({
  id,
  layout: z.enum(["1", "1-1", "3-2", "2-3", "2-1", "1-2", "1-1-1"]).default("1"),
  columns: z.array(z.array(elementSchema).max(60)).min(1).max(3),
  style: z
    .object({
      contentWidth: z.enum(["compact", "narrow", "normal", "wide", "full"]).default("wide"),
      background: optHex,
      paddingY: num(0, 200).default(40),
      paddingX: num(0, 120).default(16),
      gap: num(0, 96).default(40),
      rowGap: num(0, 96).default(20),
      valign: z.enum(["start", "center", "end"]).default("start"),
      radius: num(0, 48).default(0),
      borderColor: optHex,
      borderWidth: num(0, 8).default(0),
      hideDesktop: z.boolean().default(false),
      hideMobile: z.boolean().default(false),
    })
    .strip()
    .default({}),
});
export type DesignSection = z.infer<typeof sectionSchema>;

export const themeSchema = z
  .object({
    primaryColor: hex,
    backgroundColor: hex,
    buttonText: z.string().trim().min(2, "Texto do botão obrigatório").max(40),
    announcement: text(160).default(""),
    /** Tema visual: "dark" (Negrito/Escuro) ou "light" (Claro). */
    mode: z.enum(["dark", "light"]).optional(),
    fontFamily: themeFont.default("inter"),
    headingFont: themeFont.default("grotesk"),
    /** Cor do botão de finalizar compra e dos botões (vazio = cor principal). */
    buttonColor: optHex,
    /** Cor dos textos (vazio = automática conforme o fundo). */
    textColor: optHex,
    /** Cor predefinida dos cronómetros (vazio = cor principal). */
    countdownColor: optHex,
    /** Botão de pagamento fixo no fundo do ecrã (com o valor), sempre visível durante o scroll */
    stickyPayBar: z.boolean().default(false),
  })
  .strip();

export const MAX_ELEMENTS = 120;

export const designSchema = z
  .object({ version: z.literal(2), theme: themeSchema, sections: z.array(sectionSchema).min(1, "A página precisa de pelo menos uma secção").max(30, "Máximo de 30 secções") })
  .strip()
  .superRefine((d, ctx) => {
    const all = d.sections.flatMap((s) => s.columns.flat());
    if (all.filter((e) => e.type === "checkout").length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: "O formulário de compra tem de existir exatamente uma vez." });
    }
    const checkout = all.find((e) => e.type === "checkout");
    if (checkout && (checkout.style.hideMobile || checkout.style.hideDesktop)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: "O formulário de compra não pode ser ocultado." });
    }
    if (all.length > MAX_ELEMENTS) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: `Máximo de ${MAX_ELEMENTS} elementos.` });
    const ids = new Set<string>();
    for (const x of [...d.sections, ...all]) {
      if (ids.has(x.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections"], message: "Elementos com identificador repetido." });
      ids.add(x.id);
    }
    d.sections.forEach((s, i) => {
      if (s.columns.length !== SECTION_LAYOUTS[s.layout].cols.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", i], message: "Número de colunas inválido." });
      if (s.columns.flat().some((e) => e.type === "checkout") && (s.style.hideMobile || s.style.hideDesktop)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sections", i], message: "A secção do formulário de compra não pode ser ocultada." });
      }
    });
  });

export type CheckoutDesign = z.infer<typeof designSchema>;
export type CheckoutTheme = CheckoutDesign["theme"];

// ───────────────────────────── biblioteca ─────────────────────────────

export const ELEMENT_INFO: Record<ElementType, { label: string; description: string; group: "basic" | "content" | "product" | "commerce" }> = {
  heading: { label: "Título", description: "Título ou frase de destaque", group: "basic" },
  subtitle: { label: "Subtítulo", description: "Frase de apoio", group: "basic" },
  text: { label: "Texto", description: "Parágrafo ou descrição do produto", group: "basic" },
  image: { label: "Imagem", description: "Carregar, biblioteca ou link", group: "basic" },
  banner: { label: "Banner", description: "Imagem larga com texto", group: "basic" },
  button: { label: "Botão", description: "Leva ao formulário ou a um link", group: "basic" },
  spacer: { label: "Espaçamento", description: "Espaço vertical", group: "basic" },
  divider: { label: "Divisor", description: "Linha separadora", group: "basic" },
  video: { label: "Vídeo", description: "YouTube ou Vimeo", group: "content" },
  benefits: { label: "Benefícios", description: "O que o cliente recebe", group: "content" },
  testimonials: { label: "Depoimentos", description: "Opiniões de clientes reais", group: "content" },
  guarantee: { label: "Garantia", description: "Bloco de garantia", group: "content" },
  infoBox: { label: "Bloco de informações", description: "Ícone, título e texto", group: "content" },
  trust: { label: "Elementos de confiança", description: "Selos que configura", group: "content" },
  faq: { label: "Perguntas frequentes", description: "Respostas a dúvidas", group: "content" },
  countdown: { label: "Cronómetro", description: "Contagem decrescente visual", group: "content" },
  productSummary: { label: "Resumo do produto", description: "Imagem, nome e preço reais", group: "product" },
  productCard: { label: "Cartão do produto", description: "Imagem com destaque, nome e preço", group: "product" },
  socialProof: { label: "Prova social", description: "Compras e visitantes reais", group: "content" },
  price: { label: "Preço", description: "Preço real da oferta", group: "product" },
  checkout: { label: "Formulário de compra", description: "Dados, pagamento e resumo (protegido)", group: "commerce" },
};

export const LIBRARY_GROUPS: { id: "basic" | "content" | "product"; label: string }[] = [
  { id: "basic", label: "Básicos" },
  { id: "content", label: "Conteúdo" },
  { id: "product", label: "Produto" },
];

export type AddableType = Exclude<ElementType, "checkout">;
/**
 * Elementos que o editor simplificado deixa adicionar. Os restantes tipos (vídeo, perguntas, botão…) continuam
 * a ser apresentados e editáveis nos designs que já os têm, mas deixam de aparecer na biblioteca.
 */
export const ADDABLE_ELEMENTS: AddableType[] = ["heading", "text", "image", "banner", "productCard", "countdown", "socialProof", "benefits", "testimonials", "trust", "guarantee", "spacer"];

/** Elementos protegidos: não podem ser eliminados no editor (produto, preço e formulário de compra/pagamento). */
export function isProtectedElement(el: DesignElement): boolean {
  return el.type === "checkout" || el.type === "price" || (el.type === "heading" && el.source === "productName");
}

/** O design mostra o preço real em algum lado (elemento de preço ou cartão do produto com preço)? */
export function showsPrice(design: CheckoutDesign): boolean {
  return design.sections.some((s) => s.columns.flat().some((e) => e.type === "price" || (e.type === "productCard" && e.showPrice) || e.type === "productSummary"));
}

export function newId(prefix = "e"): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`;
}

/** Elemento novo com conteúdo de exemplo neutro (o utilizador substitui; nada é inventado sobre o produto). */
export function newElement(type: AddableType): DesignElement {
  const e = { id: newId(), style: {} };
  switch (type) {
    case "heading":
      return { ...e, type, source: "custom", text: "Novo título", level: "h2" };
    case "subtitle":
      return { ...e, type, text: "Escreva aqui um subtítulo" };
    case "text":
      return { ...e, type, source: "custom", text: "Escreva aqui o seu texto." };
    case "image":
      return { ...e, type, source: "custom", src: "", alt: "", caption: "", widthPct: 100, mobileWidthPct: 100, maxWidthPx: 0, aspect: "auto", heightPx: 0, fit: "cover", focusX: 50, focusY: 50, imgRadius: 16, imgAlign: "center" };
    case "banner":
      return { ...e, type, src: "", alt: "", title: "", subtitle: "", aspect: "3/1", overlay: 35, textColor: "#FFFFFF", focusX: 50, focusY: 50, imgRadius: 16 };
    case "video":
      return { ...e, type, url: "", caption: "" };
    case "benefits":
      return { ...e, type, title: "O que vai receber", items: ["Escreva o primeiro benefício", "Escreva o segundo benefício"], icon: "check" };
    case "testimonials":
      return { ...e, type, title: "O que dizem os nossos clientes", items: [{ name: "Nome do cliente", text: "Escreva aqui o testemunho real de um cliente.", role: "", avatarUrl: "", rating: 5 }], variant: "cards" };
    case "guarantee":
      return { ...e, type, title: "Garantia", body: "Descreva aqui as condições da sua garantia.", days: 7 };
    case "faq":
      return { ...e, type, title: "Perguntas frequentes", items: [{ q: "Como recebo o produto?", a: "Recebe o acesso logo após a confirmação do pagamento." }] };
    case "countdown":
      return { ...e, type, title: "Oferta termina em", mode: "evergreen", endsAt: "", minutes: 15, expiredText: "A oferta pode terminar a qualquer momento.", bgColor: "", textColor: "", size: "md", variant: "boxes" };
    case "infoBox":
      return { ...e, type, icon: "info", title: "Título do bloco", body: "Texto do bloco de informações.", layout: "row" };
    case "trust":
      return { ...e, type, items: [{ icon: "lock", text: "Escreva um selo" }], layout: "row", tone: "accent" };
    case "productCard":
      return { ...e, type, imageSource: "product", src: "", overlayText: "", showOverlay: true, overlayPosition: "top-left", showName: true, showPrice: true, focusX: 50, focusY: 50 };
    case "socialProof":
      return { ...e, type, mode: "real", purchasesText: "{n} pessoas compraram nas últimas 24h", viewersText: "{n} a ver agora", customPurchases: 0, customViewers: 0, showViewers: true };
    case "productSummary":
      return { ...e, type, showImage: true, showDescription: false };
    case "price":
      return { ...e, type, label: "", showCompareAt: true };
    case "button":
      return { ...e, type, label: "Comprar agora", action: "scrollToCheckout", url: "", fullWidth: false, size: "md", variant: "solid" };
    case "spacer":
      return { ...e, type, height: 32, mobileHeight: 24 };
    case "divider":
      return { ...e, type, thickness: 1, widthPct: 100, line: "solid", lineColor: "" };
  }
}

export function newSection(layout: SectionLayout = "1"): DesignSection {
  return {
    id: newId("s"),
    layout,
    columns: SECTION_LAYOUTS[layout].cols.map(() => []),
    style: { contentWidth: "wide", background: "", paddingY: 40, paddingX: 16, gap: 40, rowGap: 20, valign: "start", radius: 0, borderColor: "", borderWidth: 0, hideDesktop: false, hideMobile: false },
  };
}

/** Copia profunda com identificadores novos (duplicar elemento ou secção). */
export function cloneWithNewIds<T extends DesignElement | DesignSection>(x: T): T {
  const copy = structuredClone(x) as T;
  if ("columns" in copy) {
    copy.id = newId("s");
    copy.columns = copy.columns.map((c) => c.filter((e) => e.type !== "checkout").map((e) => ({ ...e, id: newId() })));
  } else copy.id = newId();
  return copy;
}

// ───────────────────────────── modelo padrão ─────────────────────────────

/** Cores de fábrica dos checkouts (tema escuro néon). Quando o vendedor não as alterou, o modelo padrão usa o tema claro. */
const FACTORY_COLORS = { primaryColor: "#C8F135", backgroundColor: "#0B0C0E" } as const;

/** Texto de fábrica do botão do checkout; no modelo padrão passa a «QUERO PAGAR {valor} AGORA». */
const FACTORY_BUTTON_TEXT = "Finalizar compra";

/**
 * Modelo padrão oficial (estilo «PayGate», pensado para telemóvel), numa coluna estreita e centrada:
 *  1. cronómetro em faixa vermelha («OFERTA EXPIRA EM» · 15:00, por visita — só visual)
 *  2. selo discreto «Checkout seguro · <nome da loja>»
 *  3. cartão do produto: imagem larga (com texto em destaque opcional), nome e preço reais
 *  4. prova social com dados REAIS da plataforma (compras pagas nas últimas 24 h, visitantes agora); esconde-se sem dados
 *  5. avaliações (vazias: só aparecem quando o vendedor escrever avaliações reais)
 *  6. cartão «Dados do comprador»: nome, email, número com +258 em destaque, métodos em cartões e botão verde com o valor
 *  + botão fixo no fundo do ecrã com o valor.
 * Fundo cinza-lilás muito claro, cartões brancos, destaques azul-violeta e botões verdes. Se o vendedor escolheu cores
 * próprias para o checkout, essas cores são respeitadas. Checkouts com personalização publicada não usam este modelo.
 */
export function defaultDesign(theme: { primaryColor: string; backgroundColor: string; buttonText: string }): CheckoutDesign {
  const factory = theme.primaryColor.toUpperCase() === FACTORY_COLORS.primaryColor && theme.backgroundColor.toUpperCase() === FACTORY_COLORS.backgroundColor;
  const colors = factory ? { ...CHECKOUT_THEME_PRESETS.paygate, mode: "light" as const } : { primaryColor: theme.primaryColor, backgroundColor: theme.backgroundColor };
  const main = newSection("1");
  main.id = "hero";
  main.style.contentWidth = "compact";
  main.style.paddingY = 20;
  main.style.paddingX = 14;
  main.style.rowGap = 12;
  main.columns = [
    [
      { id: "offer-timer", type: "countdown", style: {}, title: "OFERTA EXPIRA EM", mode: "evergreen", endsAt: "", minutes: 15, expiredText: "A oferta pode terminar a qualquer momento.", bgColor: "#E5322D", textColor: "#FFFFFF", size: "md", variant: "banner" },
      { id: "secure-badge", type: "trust", style: {}, items: [{ icon: "shield", text: "Checkout seguro · {loja}" }], layout: "row", tone: "muted" },
      { id: "product-card", type: "productCard", style: {}, imageSource: "product", src: "", overlayText: "", showOverlay: true, overlayPosition: "top-left", showName: true, showPrice: true, focusX: 50, focusY: 50 },
      { id: "social-proof", type: "socialProof", style: {}, mode: "real", purchasesText: "{n} pessoas compraram nas últimas 24h", viewersText: "{n} a ver agora", customPurchases: 0, customViewers: 0, showViewers: true },
      { id: "reviews", type: "testimonials", style: {}, title: "", items: [], variant: "compact" },
      {
        id: "checkout",
        type: "checkout",
        style: { marginTop: 4 },
        title: "Dados do comprador",
        subtitle: "",
        stickyDesktop: false,
        variant: "card",
        phoneTitle: "Número para fazer o pagamento",
        phoneHint: "Detectamos automaticamente M-Pesa ou e-Mola.",
        phoneNote: "Nunca partilhamos o seu número. Débito seguro e instantâneo.",
        securityItems: [
          { icon: "lock", text: "Encriptado" },
          { icon: "zap", text: "Aprovação instantânea" },
          { icon: "shield", text: "Sem taxas ocultas" },
        ],
        consentText: "Ao pagar, autoriza o débito na sua carteira móvel.",
      },
    ],
  ];
  const buttonText = theme.buttonText === FACTORY_BUTTON_TEXT ? "QUERO PAGAR {valor} AGORA" : theme.buttonText;
  return {
    version: 2,
    theme: { ...colors, buttonText, announcement: "", fontFamily: "inter", headingFont: "inter", buttonColor: factory ? "#22C55E" : "", textColor: "", countdownColor: "", stickyPayBar: true },
    sections: [main],
  };
}

/**
 * Modelo anterior (clássico): nome → imagem → preço → formulário clássico, tema claro. Continua disponível para
 * os checkouts já personalizados com ele e como referência nos testes; já não é o padrão dos novos checkouts.
 */
export function classicDesign(theme: { primaryColor: string; backgroundColor: string; buttonText: string }): CheckoutDesign {
  const factory = theme.primaryColor.toUpperCase() === FACTORY_COLORS.primaryColor && theme.backgroundColor.toUpperCase() === FACTORY_COLORS.backgroundColor;
  const colors = factory ? { ...CHECKOUT_THEME_PRESETS.light, mode: "light" as const } : { primaryColor: theme.primaryColor, backgroundColor: theme.backgroundColor };
  const main = newSection("1");
  main.id = "hero";
  main.style.contentWidth = "narrow";
  main.style.paddingY = 28;
  main.style.rowGap = 14;
  main.columns = [
    [
      { id: "product-name", type: "heading", style: { fontSize: 28, fontSizeMobile: 22 }, source: "productName", text: "", level: "h1" },
      { id: "product-image", type: "image", style: {}, source: "product", src: "", alt: "", caption: "", widthPct: 100, mobileWidthPct: 100, maxWidthPx: 0, aspect: "16/9", heightPx: 0, fit: "cover", focusX: 50, focusY: 50, imgRadius: 14, imgAlign: "center" },
      { id: "product-price", type: "price", style: { fontSize: 26, fontSizeMobile: 24 }, label: "", showCompareAt: true },
      { id: "checkout", type: "checkout", style: { marginTop: 4 }, title: "Os seus dados", subtitle: "", stickyDesktop: false, variant: "classic", phoneTitle: "", phoneHint: "", phoneNote: "", securityItems: [], consentText: "" },
    ],
  ];
  return {
    version: 2,
    theme: { ...colors, buttonText: theme.buttonText, announcement: "", fontFamily: "inter", headingFont: "inter", buttonColor: "", textColor: "", countdownColor: "", stickyPayBar: false },
    sections: [main],
  };
}

/**
 * "Restaurar estilo padrão": repõe as cores e os tipos de letra do tema escolhido e remove os estilos
 * personalizados dos elementos (tamanhos, cores, fundos, margens). Textos, imagens e a ordem mantêm-se.
 */
export function restoreDefaultStyle(design: CheckoutDesign): CheckoutDesign {
  const mode = themeMode(design.theme);
  // checkouts com o formulário em cartão (modelo padrão PayGate) voltam às cores desse modelo
  const paygate = design.sections.some((s) => s.columns.flat().some((e) => e.type === "checkout" && e.variant === "card"));
  const preset = paygate ? CHECKOUT_THEME_PRESETS.paygate : CHECKOUT_THEME_PRESETS[mode];
  return {
    ...design,
    theme: { ...design.theme, mode, primaryColor: preset.primaryColor, backgroundColor: preset.backgroundColor, fontFamily: "inter", headingFont: paygate ? "inter" : "grotesk", buttonColor: paygate ? "#22C55E" : "", textColor: "", countdownColor: "" },
    sections: design.sections.map((s) => ({
      ...s,
      style: { ...s.style, background: "", radius: 0, borderColor: "", borderWidth: 0 },
      columns: s.columns.map((c) =>
        c.map((e) => {
          const keep: ElementStyle = {};
          if (e.style.hideDesktop) keep.hideDesktop = true;
          if (e.style.hideMobile) keep.hideMobile = true;
          const base = { ...e, style: keep } as DesignElement;
          if (base.type === "countdown") return { ...base, bgColor: paygate && base.variant === "banner" ? "#E5322D" : "", textColor: paygate && base.variant === "banner" ? "#FFFFFF" : "", size: "md" as const };
          return base;
        }),
      ),
    })),
  };
}

// ───────────────────────────── designs antigos (v1) ─────────────────────────────

const legacyBlock = z.discriminatedUnion("type", [
  z.object({ id, type: z.literal("product"), showImage: z.boolean().default(true), headline: z.string().max(140).default(""), subheadline: z.string().max(1000).default("") }),
  z.object({ id, type: z.literal("banner"), imageUrl: httpsUrl, alt: z.string().max(140).default(""), rounded: z.boolean().default(true) }),
  z.object({ id, type: z.literal("text"), title: z.string().max(140).default(""), body: z.string().max(3000).default(""), align: z.enum(["left", "center"]).default("left") }),
  z.object({ id, type: z.literal("video"), url: httpsUrl, caption: z.string().max(140).default("") }),
  z.object({
    id,
    type: z.literal("testimonials"),
    title: z.string().max(140).default(""),
    items: z.array(z.object({ name: z.string().max(80), text: z.string().max(600), role: z.string().max(80).default(""), avatarUrl: httpsUrl.default(""), rating: z.number().int().min(0).max(5).default(5) })).max(12),
  }),
  z.object({ id, type: z.literal("countdown"), title: z.string().max(140).default(""), mode: z.enum(["fixed", "evergreen"]).default("evergreen"), endsAt: z.string().max(40).default(""), minutes: z.number().int().min(1).max(10080).default(15), expiredText: z.string().max(200).default("") }),
  z.object({ id, type: z.literal("benefits"), title: z.string().max(140).default(""), items: z.array(z.string().max(200)).max(20) }),
  z.object({ id, type: z.literal("guarantee"), title: z.string().max(140).default(""), body: z.string().max(1000).default(""), days: z.number().int().min(0).max(365).default(7) }),
  z.object({ id, type: z.literal("faq"), title: z.string().max(140).default(""), items: z.array(z.object({ q: z.string().max(200), a: z.string().max(1000) })).max(20) }),
  z.object({ id, type: z.literal("image"), imageUrl: httpsUrl, alt: z.string().max(140).default(""), caption: z.string().max(200).default("") }),
  z.object({ id, type: z.literal("divider") }),
]);
const legacyDesign = z.object({
  theme: z.object({ primaryColor: hex, backgroundColor: hex, buttonText: z.string().trim().min(2).max(40), layout: z.enum(["split", "stacked"]).default("split"), announcement: z.string().max(160).default(""), mode: z.enum(["dark", "light"]).optional() }),
  blocks: z.array(legacyBlock).max(40),
});

/** Texto do antigo selo "Compra segura" do modelo padrão — removido do checkout público a pedido do proprietário. */
const LEGACY_SECURE_BADGE = "Compra segura";

/** Converte um design da versão anterior (lista de blocos) para secções, sem perder conteúdo. */
export function convertLegacy(v1: z.infer<typeof legacyDesign>): CheckoutDesign {
  const els: DesignElement[] = [];
  const img = (src: string, alt: string, caption: string, radius: number): DesignElement => ({ ...(newElement("image") as Extract<DesignElement, { type: "image" }>), src, alt, caption, imgRadius: radius });
  for (const b of v1.blocks) {
    switch (b.type) {
      case "product":
        if (b.showImage) els.push({ ...(newElement("image") as Extract<DesignElement, { type: "image" }>), id: `${b.id}-image`, source: "product", aspect: "16/9", imgRadius: 20 });
        els.push({ id: `${b.id}-name`, type: "heading", style: {}, source: b.headline ? "custom" : "productName", text: b.headline, level: "h1" });
        els.push({ id: `${b.id}-description`, type: "text", style: {}, source: b.subheadline ? "custom" : "productDescription", text: b.subheadline });
        els.push({ id: `${b.id}-price`, type: "price", style: {}, label: "", showCompareAt: true });
        break;
      case "banner":
        els.push({ ...img(b.imageUrl, b.alt, "", b.rounded ? 16 : 0), id: b.id });
        break;
      case "image":
        els.push({ ...img(b.imageUrl, b.alt, b.caption, 16), id: b.id });
        break;
      case "text": {
        const style = b.align === "center" ? { align: "center" as const } : {};
        if (b.title) els.push({ id: `${b.id}-title`, type: "heading", style, source: "custom", text: b.title, level: "h2" });
        if (b.body || !b.title) els.push({ id: b.id, type: "text", style, source: "custom", text: b.body });
        break;
      }
      case "video":
        els.push({ id: b.id, type: "video", style: {}, url: b.url, caption: b.caption });
        break;
      case "testimonials":
        els.push({ id: b.id, type: "testimonials", style: {}, title: b.title, items: b.items, variant: "cards" });
        break;
      case "countdown":
        els.push({ id: b.id, type: "countdown", style: {}, title: b.title, mode: b.mode, endsAt: b.endsAt, minutes: b.minutes, expiredText: b.expiredText, bgColor: "", textColor: "", size: "md", variant: "boxes" });
        break;
      case "benefits":
        els.push({ id: b.id, type: "benefits", style: {}, title: b.title, items: b.items, icon: "check" });
        break;
      case "guarantee":
        if (b.title.trim() === LEGACY_SECURE_BADGE) break;
        els.push({ id: b.id, type: "guarantee", style: {}, title: b.title, body: b.body, days: b.days });
        break;
      case "faq":
        els.push({ id: b.id, type: "faq", style: {}, title: b.title, items: b.items });
        break;
      case "divider":
        els.push({ id: b.id, type: "divider", style: {}, thickness: 1, widthPct: 100, line: "solid", lineColor: "" });
        break;
    }
  }
  const checkout: DesignElement = { id: "checkout", type: "checkout", style: {}, title: "Os seus dados", subtitle: "Usados para enviar o acesso ao produto.", stickyDesktop: true, variant: "classic", phoneTitle: "", phoneHint: "", phoneNote: "", securityItems: [], consentText: "" };
  const stacked = v1.theme.layout === "stacked";
  const section = newSection(stacked ? "1" : "1-1");
  section.id = "main";
  section.style.contentWidth = stacked ? "narrow" : "normal";
  section.columns = stacked ? [[...els, checkout]] : [els, [checkout]];
  return {
    version: 2,
    theme: { primaryColor: v1.theme.primaryColor, backgroundColor: v1.theme.backgroundColor, buttonText: v1.theme.buttonText, announcement: v1.theme.announcement, mode: v1.theme.mode, fontFamily: "inter", headingFont: "grotesk", buttonColor: "", textColor: "", countdownColor: "", stickyPayBar: false },
    sections: [section],
  };
}

/** Lê um design guardado (atual ou da versão anterior). Inválido → null (usa-se o modelo padrão). */
export function parseDesign(value: unknown): CheckoutDesign | null {
  if (!value || typeof value !== "object") return null;
  const v2 = designSchema.safeParse(value);
  if (v2.success) return v2.data;
  const v1 = legacyDesign.safeParse(value);
  if (v1.success) {
    const converted = designSchema.safeParse(convertLegacy(v1.data));
    return converted.success ? converted.data : null;
  }
  return null;
}

/** Identificadores das imagens da biblioteca usadas num design (para verificar a propriedade no servidor). */
export function mediaIdsIn(design: CheckoutDesign): string[] {
  const ids = new Set<string>();
  const check = (src: string) => {
    const m = MEDIA_PATH.exec(src);
    if (m) ids.add(m[1]);
  };
  for (const e of design.sections.flatMap((s) => s.columns.flat())) {
    if (e.type === "image" || e.type === "banner" || e.type === "productCard") check(e.src);
    if (e.type === "testimonials") e.items.forEach((t) => check(t.avatarUrl));
  }
  return [...ids];
}

/** Predefinições de cada tema do checkout (o preço e o pagamento nunca dependem do tema). */
export const CHECKOUT_THEME_PRESETS = {
  dark: { backgroundColor: "#0B0C0E", primaryColor: "#C8F135" },
  light: { backgroundColor: "#F6F7F9", primaryColor: "#16A34A" },
  /** Modelo padrão (PayGate): fundo cinza-lilás muito claro e destaques azul-violeta (o botão é verde à parte) */
  paygate: { backgroundColor: "#F4F5FA", primaryColor: "#5B5BD6" },
} as const;

export function themeMode(theme: { mode?: "dark" | "light"; backgroundColor: string }): "dark" | "light" {
  if (theme.mode) return theme.mode;
  const m = /^#([0-9a-f]{6})$/i.exec(theme.backgroundColor);
  if (!m) return "dark";
  const n = parseInt(m[1], 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum > 140 ? "light" : "dark";
}
