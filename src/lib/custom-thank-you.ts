// Página de obrigado personalizada (área "Personalizar Checkout"): apenas aparência e textos.
// O que é entregue e a quem decide-o sempre o servidor (entrega real dos produtos pagos).
import { z } from "zod";
import { defaultThankYouDesign, type ThankYouDesign } from "./thank-you";

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use #RRGGBB)");
const text = (max: number, def: string) => z.string().trim().max(max, `Máximo de ${max} caracteres`).default(def);
/** Imagem: carregada na biblioteca da conta (/api/public/media/<id>) ou endereço https */
const MEDIA_PATH = /^\/api\/public\/media\/[a-z0-9]{20,40}$/;
const image = z
  .string()
  .trim()
  .max(2000)
  .refine((v) => v === "" || MEDIA_PATH.test(v) || /^https:\/\/[^\s"'<>]+$/i.test(v), "Imagem inválida. Carregue uma imagem do dispositivo.")
  .default("");

export const TITLE_SIZES = { sm: "Pequeno", md: "Médio", lg: "Grande" } as const;

export const customThankYouSchema = z
  .object({
    /** Nome interno da página (só para o vendedor) */
    name: text(80, "Página de obrigado"),
    title: z.string().trim().min(2, "Escreva o título").max(120, "Máximo de 120 caracteres").default("Obrigado pela sua compra!"),
    message: text(1500, "A sua compra foi confirmada. Já pode aceder ao seu produto."),
    /** Texto do botão de acesso ao produto principal (o destino é sempre a entrega real) */
    buttonText: z.string().trim().min(2, "Escreva o texto do botão").max(40, "Máximo de 40 caracteres").default("ACEDER AO MEU PRODUTO"),
    bannerUrl: image,
    mode: z.enum(["dark", "light"]).default("dark"),
    primaryColor: hex.default("#C8F135"),
    backgroundColor: hex.default("#0B0C0E"),
    titleSize: z.enum(["sm", "md", "lg"]).default("md"),
    align: z.enum(["center", "left"]).default("center"),
    showSummary: z.boolean().default(true),
  })
  .strip();
export type CustomThankYou = z.infer<typeof customThankYouSchema>;

export function defaultCustomThankYou(): CustomThankYou {
  return customThankYouSchema.parse({});
}

/** Lê uma configuração guardada (valores inválidos ou em falta voltam ao padrão). */
export function parseCustomThankYou(raw: unknown): CustomThankYou {
  const r = customThankYouSchema.safeParse(raw ?? {});
  return r.success ? r.data : defaultCustomThankYou();
}

/** Converte para o formato de apresentação da página de obrigado existente. */
export function toThankYouDesign(c: CustomThankYou): ThankYouDesign {
  return {
    ...defaultThankYouDesign(),
    mode: c.mode,
    title: c.title,
    message: c.message,
    heroImageUrl: c.bannerUrl,
    primaryColor: c.primaryColor,
    backgroundColor: c.backgroundColor,
    align: c.align,
    showSummary: c.showSummary,
  };
}
