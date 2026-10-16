// Página de obrigado personalizada por checkout (rascunho → publicada). Só aparência e textos: nunca altera
// produtos, preços, pagamentos ou o que é entregue. Usada com e sem funil (o funil decide QUANDO aparece).
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { customThankYouSchema, defaultCustomThankYou, parseCustomThankYou, type CustomThankYou } from "@/lib/custom-thank-you";
import { flattenErrors, type FieldErrors } from "@/server/validation/common";
import { own, type Scope } from "@/server/scope";
import { ensurePrimaryCheckout } from "./primary-checkout";
import { assertOwnMedia } from "./media";
import { DomainError, NotFoundError } from "./products";

export type ThankYouStatus = "default" | "published" | "unpublished_changes";
export const THANK_YOU_STATUS_LABELS: Record<ThankYouStatus, string> = {
  default: "Página padrão",
  published: "Personalizada",
  unpublished_changes: "Alterações por publicar",
};

export function thankYouStatus(r: { draft: Prisma.JsonValue; published: Prisma.JsonValue | null } | null): ThankYouStatus {
  if (!r?.published) return r ? "unpublished_changes" : "default";
  return JSON.stringify(r.draft) === JSON.stringify(r.published) ? "published" : "unpublished_changes";
}

async function scoped(productId: string, scope: Scope) {
  // só produtos da conta (e do modo) da sessão
  const product = await prisma.product.findFirst({ where: { id: productId, ...own(scope) }, include: { offers: { where: { isDefault: true }, take: 1 } } });
  if (!product) throw new NotFoundError("Produto");
  const checkout = await ensurePrimaryCheckout(product.id);
  return { product, checkout };
}

export async function getThankYouEditorState(productId: string, scope: Scope) {
  const { product, checkout } = await scoped(productId, scope);
  const record = await prisma.checkoutThankYou.findUnique({ where: { checkoutId: checkout.id } });
  return {
    product,
    checkout,
    draft: record ? parseCustomThankYou(record.draft) : defaultCustomThankYou(),
    hasPublished: Boolean(record?.published),
    status: thankYouStatus(record),
    version: record?.version ?? 0,
  };
}

export type SaveThankYouResult = { ok: true } | { ok: false; fieldErrors: FieldErrors };

/** Guarda o rascunho (os compradores continuam a ver a versão publicada). */
export async function saveThankYouDraft(productId: string, raw: unknown, scope: Scope): Promise<SaveThankYouResult> {
  const { checkout } = await scoped(productId, scope);
  const parsed = customThankYouSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: flattenErrors(parsed.error) };
  const data: CustomThankYou = parsed.data;
  // imagem carregada: tem de ser da biblioteca da própria conta
  const media = /^\/api\/public\/media\/([a-z0-9]{20,40})$/.exec(data.bannerUrl);
  if (media && !(await assertOwnMedia(scope.ownerId, [media[1]]))) throw new DomainError("A imagem escolhida não pertence a esta conta. Carregue-a novamente.");
  await prisma.checkoutThankYou.upsert({
    where: { checkoutId: checkout.id },
    create: { checkoutId: checkout.id, draft: data },
    update: { draft: data },
  });
  return { ok: true };
}

export async function publishThankYou(productId: string, raw: unknown, scope: Scope): Promise<SaveThankYouResult> {
  const r = await saveThankYouDraft(productId, raw, scope);
  if (!r.ok) return r;
  const { checkout } = await scoped(productId, scope);
  const record = await prisma.checkoutThankYou.findUniqueOrThrow({ where: { checkoutId: checkout.id } });
  await prisma.checkoutThankYou.update({ where: { id: record.id }, data: { published: record.draft ?? {}, publishedAt: new Date(), version: { increment: 1 } } });
  return { ok: true };
}

/** Restaura a página padrão: remove a personalização (rascunho e publicada). Compradores voltam ao padrão. */
export async function resetThankYou(productId: string, scope: Scope) {
  const { checkout } = await scoped(productId, scope);
  await prisma.checkoutThankYou.deleteMany({ where: { checkoutId: checkout.id } });
}

/** Página publicada de um checkout (para a página pública), ou null. */
export async function publishedThankYou(checkoutId: string | null): Promise<CustomThankYou | null> {
  if (!checkoutId) return null;
  const r = await prisma.checkoutThankYou.findUnique({ where: { checkoutId }, select: { published: true } });
  return r?.published ? parseCustomThankYou(r.published) : null;
}
