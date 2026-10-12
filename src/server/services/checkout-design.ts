// Personalização visual do checkout principal de cada produto (rascunho ≠ versão publicada).
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { defaultDesign, designSchema, parseDesign, type CheckoutDesign } from "@/lib/checkout-design";
import { flattenErrors, type FieldErrors } from "@/server/validation/common";
import { ensurePrimaryCheckout } from "./primary-checkout";
import { NotFoundError } from "./products";

export type DesignStatus = "default" | "published" | "unpublished_changes";

export const DESIGN_STATUS_LABELS: Record<DesignStatus, string> = {
  default: "Modelo padrão",
  published: "Personalização publicada",
  unpublished_changes: "Alterações por publicar",
};

function themeFrom(c: { primaryColor: string; backgroundColor: string; buttonText: string }) {
  return { primaryColor: c.primaryColor, backgroundColor: c.backgroundColor, buttonText: c.buttonText };
}

export function designStatus(d: { draft: Prisma.JsonValue; published: Prisma.JsonValue | null } | null): DesignStatus {
  if (!d) return "default";
  if (!d.published) return "unpublished_changes";
  return JSON.stringify(d.draft) === JSON.stringify(d.published) ? "published" : "unpublished_changes";
}

/** Design apresentado aos compradores: a versão publicada, ou o modelo padrão. */
export function publicDesign(checkout: { primaryColor: string; backgroundColor: string; buttonText: string; design?: { published: Prisma.JsonValue | null } | null }): CheckoutDesign {
  return parseDesign(checkout.design?.published) ?? defaultDesign(themeFrom(checkout));
}

async function productScoped(productId: string, isDemo: boolean) {
  // Autorização no servidor: só produtos do âmbito atual (dados reais ou de demonstração)
  const product = await prisma.product.findFirst({ where: { id: productId, isDemo }, include: { offers: { where: { isDefault: true }, take: 1 } } });
  if (!product) throw new NotFoundError("Produto");
  const checkout = await ensurePrimaryCheckout(product.id);
  return { product, checkout };
}

export async function getEditorState(productId: string, isDemo: boolean) {
  const { product, checkout } = await productScoped(productId, isDemo);
  const record = await prisma.checkoutDesign.findUnique({ where: { checkoutId: checkout.id } });
  const fallback = defaultDesign(themeFrom(checkout));
  return {
    product,
    checkout,
    draft: parseDesign(record?.draft) ?? parseDesign(record?.published) ?? fallback,
    hasPublished: Boolean(record?.published),
    status: designStatus(record),
    publishedAt: record?.publishedAt ?? null,
    draftUpdatedAt: record?.draftUpdatedAt ?? null,
    version: record?.version ?? 0,
  };
}

export type SaveDesignResult = { ok: true } | { ok: false; fieldErrors: FieldErrors };

/** Guarda o rascunho. Não altera a versão publicada (compradores continuam a ver a anterior). */
export async function saveDraft(productId: string, input: unknown, isDemo: boolean): Promise<SaveDesignResult> {
  const parsed = designSchema.safeParse(input);
  if (!parsed.success) return { ok: false, fieldErrors: flattenErrors(parsed.error) };
  const { checkout } = await productScoped(productId, isDemo);
  const draft = parsed.data as unknown as Prisma.InputJsonValue;
  await prisma.checkoutDesign.upsert({
    where: { checkoutId: checkout.id },
    create: { checkoutId: checkout.id, draft },
    update: { draft, draftUpdatedAt: new Date() },
  });
  return { ok: true };
}

/** Publica o rascunho atual no checkout do produto. O link do checkout não muda. */
export async function publishDesign(productId: string, isDemo: boolean) {
  const { checkout } = await productScoped(productId, isDemo);
  const record = await prisma.checkoutDesign.findUnique({ where: { checkoutId: checkout.id } });
  const draft = parseDesign(record?.draft);
  if (!record || !draft) throw new NotFoundError("Rascunho");
  await prisma.$transaction([
    prisma.checkoutDesign.update({
      where: { id: record.id },
      data: { published: draft as unknown as Prisma.InputJsonValue, publishedAt: new Date(), version: { increment: 1 } },
    }),
    // mantém as colunas visuais antigas coerentes (usadas por páginas de estado/sucesso)
    prisma.checkout.update({ where: { id: checkout.id }, data: { primaryColor: draft.theme.primaryColor, backgroundColor: draft.theme.backgroundColor, buttonText: draft.theme.buttonText } }),
  ]);
}

/** Descarta o rascunho, voltando à versão publicada (ou ao modelo padrão). */
export async function discardDraft(productId: string, isDemo: boolean) {
  const { checkout } = await productScoped(productId, isDemo);
  const record = await prisma.checkoutDesign.findUnique({ where: { checkoutId: checkout.id } });
  if (!record) return;
  if (record.published) await prisma.checkoutDesign.update({ where: { id: record.id }, data: { draft: record.published as Prisma.InputJsonValue, draftUpdatedAt: new Date() } });
  else await prisma.checkoutDesign.delete({ where: { id: record.id } });
}

/** Lista para a área "Personalização do Checkout": todos os produtos do âmbito, com o seu checkout principal. */
export async function listCheckoutPersonalization(isDemo: boolean, q?: string) {
  const products = await prisma.product.findMany({
    where: { isDemo, status: { not: "ARCHIVED" }, ...(q ? { name: { contains: q, mode: "insensitive" as const } } : {}) },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  // recuperação automática de produtos sem checkout principal (ou sem endereço legível)
  const needing = await prisma.product.findMany({
    where: {
      id: { in: products.map((p) => p.id) },
      OR: [{ checkouts: { none: { primaryProductId: { not: null } } } }, { checkouts: { some: { primaryProductId: { not: null }, slug: null } } }],
    },
    select: { id: true },
  });
  for (const p of needing) await ensurePrimaryCheckout(p.id);
  return prisma.product.findMany({
    where: { id: { in: products.map((p) => p.id) } },
    orderBy: { createdAt: "desc" },
    include: {
      offers: { where: { isDefault: true }, take: 1 },
      checkouts: { where: { primaryProductId: { not: null } }, include: { design: { select: { draft: true, published: true, publishedAt: true } } } },
    },
  });
}
