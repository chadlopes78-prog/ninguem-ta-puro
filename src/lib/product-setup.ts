// Regras partilhadas (browser + servidor) da configuração de um produto: entrega do produto (obrigatória para
// publicar: ficheiro, link de acesso ou página de entrega interna) e suporte via WhatsApp (opcional).
// O servidor volta sempre a validar: o browser só ajuda a mostrar os erros mais cedo.
import { z } from "zod";
import { normalizeWhatsApp } from "./thank-you";

export { normalizeWhatsApp };

/** Link de entrega: http(s) completo, com domínio, sem espaços nem caracteres de HTML. */
export function isValidDeliveryUrl(url: string): boolean {
  if (!url || url.length > 2000 || /[\s"'<>]/.test(url)) return false;
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && /^[^.]+(\.[^.]+)+$/.test(u.hostname) && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Link wa.me para o número de suporte (com mensagem inicial opcional). null se o número for inválido. */
export function supportLink(phone: string | null | undefined, message?: string | null): string | null {
  const n = phone ? normalizeWhatsApp(phone) : null;
  if (!n) return null;
  return `https://wa.me/${n}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

const text = (max: number) => z.string().trim().max(max, `Máximo de ${max} caracteres`).default("");

export const supportSchema = z
  .object({
    /** Vazio = ainda por configurar (o produto fica incompleto). Preenchido tem de ser válido. */
    phone: z
      .string()
      .trim()
      .max(30)
      .default("")
      .refine((v) => v === "" || normalizeWhatsApp(v) !== null, "Número inválido. Use o formato internacional, ex.: +258 84 123 4567"),
    message: text(300),
  })
  .strip();
export type SupportInput = z.infer<typeof supportSchema>;

export const deliveryPageSchema = z
  .object({
    title: z.string().trim().min(2, "Escreva o título da página").max(140).default("O seu produto está pronto"),
    welcome: text(2000),
    instructions: text(3000),
    bodyText: text(10000),
    buttonText: z.string().trim().min(2, "Escreva o texto do botão").max(40, "Máximo de 40 caracteres").default("ACEDER AO MEU PRODUTO"),
    resourceUrl: z
      .string()
      .trim()
      .max(2000)
      .default("")
      .refine((v) => v === "" || isValidDeliveryUrl(v), "Link inválido (use https://…)"),
    fileId: z.string().regex(/^[a-z0-9]{10,40}$/i).nullable().default(null),
  })
  .strip();
export type DeliveryPageInput = z.infer<typeof deliveryPageSchema>;

export const deliverySchema = z
  .object({
    /** null = ainda por escolher (o produto fica incompleto) */
    method: z.enum(["FILE", "EXTERNAL_LINK", "INTERNAL_PAGE"]).nullable().default(null),
    url: z.string().trim().max(2000).default(""),
    /** Ficheiro entregue (método FILE): tem de ser um ficheiro do próprio produto (validado no servidor) */
    fileId: z.string().regex(/^[a-z0-9]{10,40}$/i).nullable().default(null),
    page: deliveryPageSchema.default({}),
  })
  .strip()
  .superRefine((v, ctx) => {
    if (v.method === "EXTERNAL_LINK" && v.url !== "" && !isValidDeliveryUrl(v.url)) ctx.addIssue({ code: "custom", path: ["url"], message: "Link inválido. Use o endereço completo, ex.: https://minha-area.com/curso" });
  });
export type DeliveryInput = z.infer<typeof deliverySchema>;

/** Conteúdo efetivo da página interna: tem de haver algo real para entregar. */
export function internalPageHasContent(page: { fileId: string | null; resourceUrl: string | null; bodyText: string } | null): boolean {
  if (!page) return false;
  return Boolean(page.fileId) || Boolean(page.resourceUrl && isValidDeliveryUrl(page.resourceUrl)) || page.bodyText.trim().length >= 10;
}

export type RequirementKey = "product" | "checkout" | "funnel" | "thankYou" | "whatsapp" | "delivery" | "deliveryContent";

export const REQUIREMENT_LABELS: Record<RequirementKey, string> = {
  product: "Produto configurado",
  checkout: "Checkout configurado",
  funnel: "Funil associado",
  thankYou: "Página de obrigado configurada",
  whatsapp: "Número de suporte WhatsApp",
  delivery: "Método de entrega",
  deliveryContent: "Conteúdo de entrega",
};

export type ProductStage = "draft" | "incomplete" | "ready" | "published" | "published_incomplete" | "unpublished" | "archived";

export const STAGE_LABELS: Record<ProductStage, string> = {
  draft: "Rascunho",
  incomplete: "Incompleto",
  ready: "Pronto para publicar",
  published: "Publicado",
  published_incomplete: "Publicado · configuração em falta",
  unpublished: "Despublicado",
  archived: "Arquivado",
};
