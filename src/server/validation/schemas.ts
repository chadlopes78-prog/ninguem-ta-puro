import { isValidDeliveryUrl } from "@/lib/product-setup";
import { z } from "zod";
import {
  checkbox,
  currencySchema,
  hexColor,
  moneyInput,
  optionalEmail,
  optionalString,
  optionalUrl,
} from "./common";
import { isDayKey } from "@/lib/dates";

export const PRODUCT_TYPES = ["DIGITAL", "COURSE", "EBOOK", "PDF", "SERVICE", "OTHER"] as const;
export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "UNPUBLISHED", "ARCHIVED"] as const;

/**
 * Imagem do produto: imagem carregada para a biblioteca da conta (/api/public/media/<id>) ou, por
 * compatibilidade com produtos antigos, um URL http(s) já guardado. Vazio = sem imagem.
 */
export const PRODUCT_MEDIA_PATH = /^\/api\/public\/media\/([a-z0-9]{20,40})$/;
const productImage = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || PRODUCT_MEDIA_PATH.test(v) || /^https?:\/\/[^\s"'<>]+$/i.test(v), { message: "Carregue uma imagem (JPEG, PNG, WebP ou GIF)." });

export const productSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres").max(120, "Máximo de 120 caracteres"),
  description: z.string().trim().min(10, "A descrição deve ter pelo menos 10 caracteres").max(5000),
  imageUrl: productImage,
  /** Banner promocional (imagem larga do checkout); independente da imagem principal */
  bannerUrl: productImage,
  /** Pedir o email no checkout (interruptor do formulário: "true"/"false"; omitido = mantém/ativo) */
  collectEmail: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === "" ? undefined : v === true || v === "true" || v === "on")),
  type: z.enum(PRODUCT_TYPES, { errorMap: () => ({ message: "Selecione um tipo" }) }),
  category: optionalString(80),
  priceCents: moneyInput({ min: 100, label: "Preço" }),
  compareAtCents: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === "") return undefined;
      const parsed = moneyInput({ label: "Preço promocional de referência" }).safeParse(v);
      if (!parsed.success) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: parsed.error.issues[0].message });
        return z.NEVER;
      }
      return parsed.data;
    }),
  currency: currencySchema,
  status: z.enum(["DRAFT", "PUBLISHED", "UNPUBLISHED"]).default("DRAFT"),
  salesPageUrl: optionalUrl,
  supportEmail: optionalEmail,
  deliveryUrl: optionalUrl,
  /**
   * Entrega do produto (secção "Entrega do produto"): não enviado = mantém a configuração atual.
   * FILE = ficheiro privado do produto; EXTERNAL_LINK = link de acesso (SaaS, área de membros…);
   * INTERNAL_PAGE = página de entrega da plataforma (configurações anteriores, editada no funil).
   */
  deliveryMethod: z
    .enum(["FILE", "EXTERNAL_LINK", "INTERNAL_PAGE", ""])
    .optional()
    .transform((v) => (v ? v : undefined)),
  /** Link de acesso ao produto (método EXTERNAL_LINK). Vazio = ainda por indicar (produto incompleto). */
  accessUrl: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .refine((v) => !v || isValidDeliveryUrl(v), "Link inválido. Use o endereço completo, ex.: https://meusite.com/app"),
}).refine((p) => p.compareAtCents === undefined || p.compareAtCents > p.priceCents, {
  path: ["compareAtCents"],
  message: "O preço de referência deve ser superior ao preço principal",
});
export type ProductInput = z.infer<typeof productSchema>;

export const offerSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(120),
  priceCents: moneyInput({ min: 100, label: "Preço" }),
  currency: currencySchema,
  billingType: z.enum(["ONE_TIME", "INSTALLMENTS", "SUBSCRIPTION"]).default("ONE_TIME"),
  maxInstallments: z.coerce.number().int().min(1).max(24).default(1),
  isActive: checkbox,
});
export type OfferInput = z.infer<typeof offerSchema>;

export const checkoutSchema = z
  .object({
    name: z.string().trim().min(2, "Nome interno obrigatório").max(120),
    productId: z.string().min(1, "Selecione um produto"),
    offerId: z.string().min(1, "Selecione uma oferta/preço"),
    title: z.string().trim().min(2, "Título obrigatório").max(140),
    description: optionalString(3000),
    imageUrl: optionalUrl,
    buttonText: z.string().trim().min(2, "Texto do botão obrigatório").max(40),
    primaryColor: hexColor,
    backgroundColor: hexColor,
    collectPhone: checkbox,
    requirePhone: checkbox,
    collectDocument: checkbox,
    requireDocument: checkbox,
    allowCoupons: checkbox,
    successTitle: z.string().trim().min(2).max(140),
    successMessage: z.string().trim().min(2).max(2000),
    successRedirectUrl: optionalUrl,
    supportEmail: optionalEmail,
    funnelId: optionalString(40),
    isActive: checkbox,
  })
  .transform((c) => ({
    ...c,
    collectPhone: c.collectPhone || c.requirePhone,
    collectDocument: c.collectDocument || c.requireDocument,
  }));
export type CheckoutInput = z.infer<typeof checkoutSchema>;

const dateInput = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    if (!isDayKey(v)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Data inválida" });
      return z.NEVER;
    }
    return v;
  });

export const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3, "O código deve ter pelo menos 3 caracteres")
      .max(32, "Máximo de 32 caracteres")
      .regex(/^[A-Z0-9_-]+$/, "Use apenas letras, números, - e _"),
    description: optionalString(200),
    type: z.enum(["PERCENT", "FIXED"]),
    percentOff: z.coerce.number().optional(),
    amountOff: z.string().optional(),
    currency: z.union([currencySchema, z.literal("")]).optional(),
    appliesToAll: checkbox,
    productIds: z.array(z.string()).default([]),
    startsAt: dateInput,
    endsAt: dateInput,
    maxUses: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v, ctx) => {
        if (v === undefined || v === "") return undefined;
        const n = Number(v);
        if (!Number.isInteger(n) || n < 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Limite deve ser um inteiro positivo" });
          return z.NEVER;
        }
        return n;
      }),
    isActive: checkbox,
  })
  .superRefine((c, ctx) => {
    if (c.type === "PERCENT") {
      if (!c.percentOff || !Number.isInteger(c.percentOff) || c.percentOff < 1 || c.percentOff > 100) {
        ctx.addIssue({ path: ["percentOff"], code: z.ZodIssueCode.custom, message: "Percentagem entre 1 e 100" });
      }
    } else {
      const parsed = moneyInput({ min: 1, label: "Valor do desconto" }).safeParse(c.amountOff ?? "");
      if (!parsed.success) ctx.addIssue({ path: ["amountOff"], code: z.ZodIssueCode.custom, message: parsed.error.issues[0].message });
      if (!c.currency) ctx.addIssue({ path: ["currency"], code: z.ZodIssueCode.custom, message: "Descontos fixos exigem moeda" });
    }
    if (c.startsAt && c.endsAt && c.endsAt < c.startsAt) {
      ctx.addIssue({ path: ["endsAt"], code: z.ZodIssueCode.custom, message: "A data final deve ser posterior à inicial" });
    }
    if (!c.appliesToAll && c.productIds.length === 0) {
      ctx.addIssue({ path: ["productIds"], code: z.ZodIssueCode.custom, message: "Selecione pelo menos um produto elegível" });
    }
  })
  .transform((c) => ({
    code: c.code,
    description: c.description,
    type: c.type,
    percentOff: c.type === "PERCENT" ? c.percentOff! : null,
    amountOffCents: c.type === "FIXED" ? (moneyInput().parse(c.amountOff ?? "0") as number) : null,
    currency: c.type === "FIXED" && c.currency ? c.currency : null,
    appliesToAll: c.appliesToAll,
    productIds: c.appliesToAll ? [] : c.productIds,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    maxUses: c.maxUses ?? null,
    isActive: c.isActive,
  }));
export type CouponInput = z.infer<typeof couponSchema>;

export const settingsSchema = z.object({
  businessName: z.string().trim().min(2, "Nome obrigatório").max(80),
  logoUrl: optionalUrl,
  ownerName: optionalString(120),
  ownerEmail: optionalEmail,
  supportEmail: optionalEmail,
  defaultCurrency: currencySchema,
  locale: z.enum(["pt-MZ", "pt-BR", "pt-PT", "en-US"]),
  timezone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Fuso horário inválido"),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

/** Idiomas suportados: a interface está em português; a variante define o idioma da página e os formatos regionais. */
export const SUPPORTED_LOCALES = { "pt-MZ": "Português (Moçambique)", "pt-PT": "Português (Portugal)", "pt-BR": "Português (Brasil)" } as const;

/** Configurações pessoais da conta (página Configurações). O email da conta não é editável aqui. */
export const accountSettingsSchema = z.object({
  name: z.string().trim().min(2, "Indique o seu nome").max(80, "Máximo de 80 caracteres"),
  locale: z.enum(["pt-MZ", "pt-PT", "pt-BR"], { errorMap: () => ({ message: "Idioma não suportado" }) }),
  defaultCurrency: currencySchema,
  timezone: settingsSchema.shape.timezone,
});
export type AccountSettingsInput = z.infer<typeof accountSettingsSchema>;

export const publicCheckoutSchema = (opts: { requirePhone: boolean; requireDocument: boolean; requireEmail?: boolean }) =>
  z.object({
    name: z.string().trim().min(3, "Introduza o seu nome completo").max(120),
    email:
      opts.requireEmail === false
        ? z
            .string()
            .trim()
            .toLowerCase()
            .max(254)
            .optional()
            .refine((v) => !v || z.string().email().safeParse(v).success, "Introduza um email válido")
        : z.string().trim().toLowerCase().email("Introduza um email válido").max(254),
    phone: opts.requirePhone
      ? z.string().trim().regex(/^[+\d][\d\s()-]{7,19}$/, "Telefone inválido")
      : z
          .string()
          .trim()
          .optional()
          .refine((v) => !v || /^[+\d][\d\s()-]{7,19}$/.test(v), "Telefone inválido"),
    document: opts.requireDocument
      ? z.string().trim().min(5, "Documento inválido").max(30)
      : optionalString(30),
    coupon: optionalString(32),
    method: optionalString(30),
    idempotencyKey: optionalString(64),
  });

export const loginSchema = z.object({
  email: z.string().trim().email("Email inválido"),
  password: z.string().min(1, "Introduza a password"),
});

export const setupSchema = z
  .object({
    name: z.string().trim().min(2, "Nome obrigatório").max(80),
    email: z.string().trim().email("Email inválido"),
    password: z.string().min(10, "A password deve ter pelo menos 10 caracteres").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "As passwords não coincidem" });

export const manualOrderSchema = z.object({
  productId: z.string().min(1, "Selecione um produto"),
  offerId: z.string().min(1, "Selecione uma oferta"),
  customerName: z.string().trim().min(2, "Nome obrigatório").max(120),
  customerEmail: z.string().trim().toLowerCase().email("Email inválido"),
  status: z.enum(["PENDING", "DECLINED", "CANCELED"]),
  notes: optionalString(500),
});
