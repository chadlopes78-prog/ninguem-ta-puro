// Página de obrigado: aparência (design) e destino do botão principal (action).
// Validado no servidor (Zod) — o browser nunca define o que é entregue nem a quem.
import { z } from "zod";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB)");
const httpsOrEmpty = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Use um endereço https://")
  .default("");
const text = (max: number, def = "") => z.string().trim().max(max).default(def);

export const THANK_YOU_FONTS = { modern: "Moderna", classic: "Clássica", rounded: "Arredondada" } as const;
export const FONT_STACKS: Record<keyof typeof THANK_YOU_FONTS, string> = {
  modern: '"Space Grotesk Variable", "Inter Variable", ui-sans-serif, system-ui, sans-serif',
  classic: 'Georgia, "Times New Roman", serif',
  rounded: '"Inter Variable", ui-rounded, "SF Pro Rounded", system-ui, sans-serif',
};

export const thankYouDesignSchema = z
  .object({
    mode: z.enum(["dark", "light"]).default("dark"),
    title: text(120, "Compra confirmada com sucesso!"),
    subtitle: text(200, ""),
    message: text(1500, "Obrigado pela sua compra. O seu pedido foi confirmado. Utilize o botão abaixo para continuar."),
    instructions: text(1500, ""),
    logoUrl: httpsOrEmpty,
    heroImageUrl: httpsOrEmpty,
    primaryColor: hex.default("#C8F135"),
    backgroundColor: hex.default("#0B0C0E"),
    font: z.enum(["modern", "classic", "rounded"]).default("modern"),
    align: z.enum(["center", "left"]).default("center"),
    spacing: z.enum(["compact", "normal", "spacious"]).default("normal"),
    helperText: text(300, ""),
    supportText: text(300, ""),
    showSummary: z.boolean().default(true),
  })
  .strip();
export type ThankYouDesign = z.infer<typeof thankYouDesignSchema>;

/** Número de WhatsApp em formato internacional, só dígitos. 8XXXXXXXX (Moçambique) recebe o indicativo 258. */
export function normalizeWhatsApp(input: string): string | null {
  const digits = input.replace(/[\s()+.-]/g, "");
  if (!/^\d+$/.test(digits)) return null;
  if (/^8[2-7]\d{7}$/.test(digits)) return `258${digits}`;
  if (/^\d{10,15}$/.test(digits)) return digits;
  return null;
}

export function whatsappLink(phone: string, message: string): string {
  const n = normalizeWhatsApp(phone);
  if (!n) throw new Error("Número de WhatsApp inválido");
  return `https://wa.me/${n}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export const thankYouActionSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("product"),
        delivery: z.enum(["pdf", "link"]),
        url: z.string().trim().max(2000).default(""),
        buttonText: text(60, ""),
      })
      .strip(),
    z
      .object({
        type: z.literal("whatsapp"),
        phone: z.string().trim().max(30),
        message: text(500, ""),
        buttonText: text(60, ""),
      })
      .strip(),
  ])
  .superRefine((v, ctx) => {
    if (v.type === "product" && v.delivery === "link" && !/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v.url)) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "Introduza o endereço completo do produto (https://…)" });
    }
    if (v.type === "whatsapp" && !normalizeWhatsApp(v.phone)) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Número de WhatsApp inválido (ex.: 84 123 4567 ou 258841234567)" });
    }
  });
export type ThankYouAction = z.infer<typeof thankYouActionSchema>;

export const DEFAULT_BUTTON_TEXT = { pdf: "Descarregar o meu produto", link: "Aceder ao meu produto", whatsapp: "Falar connosco no WhatsApp" } as const;

export function defaultThankYouDesign(overrides: Partial<ThankYouDesign> = {}): ThankYouDesign {
  return thankYouDesignSchema.parse(overrides);
}

export function defaultThankYouAction(): ThankYouAction {
  return { type: "product", delivery: "link", url: "", buttonText: "" };
}

export function parseThankYouDesign(raw: unknown): ThankYouDesign {
  const r = thankYouDesignSchema.safeParse(raw ?? {});
  return r.success ? r.data : defaultThankYouDesign();
}

/** Ação guardada (pode estar incompleta num rascunho). */
export function parseThankYouAction(raw: unknown): ThankYouAction | null {
  const r = thankYouActionSchema.safeParse(raw);
  return r.success ? r.data : null;
}

export function buttonLabel(action: ThankYouAction | null): string {
  if (!action) return "";
  if (action.buttonText) return action.buttonText;
  if (action.type === "whatsapp") return DEFAULT_BUTTON_TEXT.whatsapp;
  return action.delivery === "pdf" ? DEFAULT_BUTTON_TEXT.pdf : DEFAULT_BUTTON_TEXT.link;
}

export const LIGHT_PRESET = { backgroundColor: "#F6F7F9", primaryColor: "#1F6FEB" } as const;
export const DARK_PRESET = { backgroundColor: "#0B0C0E", primaryColor: "#C8F135" } as const;
