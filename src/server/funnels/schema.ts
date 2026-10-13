import { z } from "zod";
import { STEP_TYPES } from "@/lib/funnels/types";

const key = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Identificador inválido");
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const stepConfigSchema = z
  .object({
    url: opt(2000).refine((v) => !v || /^https?:\/\//i.test(v), "URL inválido"),
    productId: opt(40),
    offerId: opt(40),
    checkoutId: opt(40),
    headline: opt(160),
    body: opt(3000),
    acceptText: opt(60),
    declineText: opt(80),
    imageUrl: opt(2000).refine((v) => !v || /^https?:\/\//i.test(v), "URL inválido"),
    title: opt(160),
    message: opt(2000),
    redirectUrl: opt(2000).refine((v) => !v || /^https?:\/\//i.test(v), "URL inválido"),
    videoUrl: opt(2000).refine((v) => !v || /^https:\/\//i.test(v), "URL inválido"),
    afterAccept: z.enum(["thank_you", "url"]).optional(),
    afterAcceptUrl: opt(2000).refine((v) => !v || /^https:\/\//i.test(v), "URL inválido"),
    afterDecline: z.enum(["thank_you", "url"]).optional(),
    afterDeclineUrl: opt(2000).refine((v) => !v || /^https:\/\//i.test(v), "URL inválido"),
    afterFail: z.enum(["retry", "thank_you"]).optional(),
  })
  .strip();

export const graphSchema = z.object({
  nodes: z
    .array(
      z.object({
        key,
        type: z.enum(STEP_TYPES),
        label: z.string().trim().max(80),
        position: z.object({ x: z.number().finite().min(-100000).max(100000), y: z.number().finite().min(-100000).max(100000) }),
        config: stepConfigSchema.default({}),
      }),
    )
    .max(100, "Máximo de 100 etapas por funil"),
  edges: z
    .array(z.object({ key, source: key, target: key, sourceHandle: z.enum(["next", "accept", "decline"]) }))
    .max(300),
});

export const funnelMetaSchema = z.object({
  name: z.string().trim().min(2, "Nome obrigatório").max(100),
  description: z.string().trim().max(500).optional().transform((v) => (v ? v : undefined)),
});
