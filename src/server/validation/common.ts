import { z } from "zod";
import { CURRENCIES } from "@/lib/money";
import { parseMoneyToCents } from "@/lib/money";

export const currencySchema = z.enum(CURRENCIES, { errorMap: () => ({ message: "Selecione uma moeda válida" }) });

/** Aceita string vazia como undefined (inputs de formulário). */
export const optionalString = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `Máximo de ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v) || /^\/[^\s]*$/.test(v), {
    message: "Introduza um URL válido (https://…)",
  });

export const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .optional()
  .transform((v) => (v ? v.toLowerCase() : undefined))
  .refine((v) => !v || z.string().email().safeParse(v).success, { message: "Email inválido" });

export const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida (use o formato #RRGGBB)");

/** Valor monetário introduzido como texto → cêntimos inteiros. */
export const moneyInput = (opts: { min?: number; label?: string } = {}) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const cents = parseMoneyToCents(v);
    if (cents === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${opts.label ?? "Valor"} inválido` });
      return z.NEVER;
    }
    if (opts.min !== undefined && cents < opts.min) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${opts.label ?? "Valor"} deve ser pelo menos ${(opts.min / 100).toFixed(2)}` });
      return z.NEVER;
    }
    if (cents > 100_000_000_00) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${opts.label ?? "Valor"} demasiado elevado` });
      return z.NEVER;
    }
    return cents;
  });

export const checkbox = z
  .union([z.boolean(), z.literal("on"), z.literal("true"), z.literal("false"), z.literal("")])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");

export type FieldErrors = Record<string, string>;

export function flattenErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: FieldErrors };
