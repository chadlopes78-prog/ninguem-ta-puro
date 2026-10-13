import { Prisma, type ProductStatus, type ProductType } from "@prisma/client";
import { prisma } from "@/server/db";
import { createPrimaryCheckoutTx, ensurePrimaryCheckout } from "./primary-checkout";
import type { OfferInput, ProductInput } from "@/server/validation/schemas";
import { own, type Scope } from "@/server/scope";

export class NotFoundError extends Error {
  constructor(what = "Registo") {
    super(`${what} não encontrado`);
  }
}

export class DomainError extends Error {}

export interface ProductListQuery {
  scope: Scope;
  q?: string;
  status?: ProductStatus | "ALL" | "ACTIVE";
  type?: ProductType;
  sort?: "newest" | "oldest" | "name" | "price_desc" | "price_asc" | "orders";
}

export async function listProducts(query: ProductListQuery) {
  const where: Prisma.ProductWhereInput = { ...own(query.scope) };
  if (query.q) where.OR = [{ name: { contains: query.q, mode: "insensitive" } }, { category: { contains: query.q, mode: "insensitive" } }];
  if (!query.status || query.status === "ACTIVE") where.status = { not: "ARCHIVED" };
  else if (query.status !== "ALL") where.status = query.status;
  if (query.type) where.type = query.type;

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    query.sort === "oldest"
      ? { createdAt: "asc" }
      : query.sort === "name"
        ? { name: "asc" }
        : query.sort === "orders"
          ? { orderItems: { _count: "desc" } }
          : { createdAt: "desc" };

  const products = await prisma.product.findMany({
    where,
    orderBy,
    include: {
      offers: { where: { isDefault: true }, take: 1 },
      checkouts: { where: { primaryProductId: { not: null } }, select: { slug: true, publicId: true, isActive: true }, take: 1 },
      _count: { select: { orderItems: true, checkouts: true } },
    },
    take: 500,
  });
  // recuperação: produtos sem checkout principal (antigos ou falha) recebem-no agora
  for (const p of products) {
    if (!p.checkouts[0]?.slug) {
      const c = await ensurePrimaryCheckout(p.id);
      p.checkouts = [{ slug: c.slug, publicId: c.publicId, isActive: c.isActive }];
    }
  }
  const rows = products.map((p) => ({ ...p, defaultOffer: p.offers[0] ?? null, primaryCheckout: p.checkouts[0] ?? null }));
  if (query.sort === "price_desc" || query.sort === "price_asc") {
    const dir = query.sort === "price_desc" ? -1 : 1;
    rows.sort((a, b) => dir * ((a.defaultOffer?.priceCents ?? 0) - (b.defaultOffer?.priceCents ?? 0)));
  }
  return rows;
}

export async function getProduct(id: string, scope: Scope) {
  const product = await prisma.product.findFirst({
    where: { id, ...own(scope) },
    include: { offers: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }, _count: { select: { orderItems: true, checkouts: true } } },
  });
  if (!product) throw new NotFoundError("Produto");
  return product;
}

function productData(input: ProductInput) {
  return {
    name: input.name,
    description: input.description,
    imageUrl: input.imageUrl ?? null,
    type: input.type,
    category: input.category ?? null,
    status: input.status,
    salesPageUrl: input.salesPageUrl ?? null,
    supportEmail: input.supportEmail ?? null,
    deliveryUrl: input.deliveryUrl ?? null,
  };
}

/**
 * Cria o produto, o preço principal e o checkout principal (com link público) numa única transação:
 * ou fica tudo criado, ou nada fica criado. Se algo falhar depois (ex.: produto antigo sem checkout),
 * ensurePrimaryCheckout() recupera a associação de forma idempotente.
 */
export async function createProduct(input: ProductInput, scope: Scope) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            ...productData(input),
            ...own(scope),
            offers: {
              create: {
                name: "Preço principal",
                priceCents: input.priceCents,
                compareAtCents: input.compareAtCents ?? null,
                currency: input.currency,
                isDefault: true,
              },
            },
          },
          include: { offers: true },
        });
        const checkout = await createPrimaryCheckoutTx(tx, product, product.offers[0].id);
        return { ...product, primaryCheckout: checkout };
      });
    } catch (e) {
      // slug criado em paralelo por outro pedido: tenta de novo com outro endereço
      if (attempt < 2 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
}

export async function updateProduct(id: string, input: ProductInput, scope: Scope) {
  const existing = await getProduct(id, scope);
  if (existing.status === "ARCHIVED") throw new DomainError("Produtos arquivados não podem ser editados. Restaure-o primeiro.");
  const defaultOffer = existing.offers.find((o) => o.isDefault);
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.update({ where: { id }, data: productData(input) });
    // O checkout principal acompanha o nome/descrição do produto enquanto não tiverem sido personalizados.
    // O endereço (slug) nunca muda, para não invalidar links já partilhados.
    const primary = await tx.checkout.findUnique({ where: { primaryProductId: id } });
    if (primary) {
      await tx.checkout.update({
        where: { id: primary.id },
        data: {
          ...(primary.title === existing.name ? { title: input.name } : {}),
          ...(primary.description === existing.description ? { description: input.description } : {}),
          ...(primary.name === `Checkout — ${existing.name}`.slice(0, 120) ? { name: `Checkout — ${input.name}`.slice(0, 120) } : {}),
        },
      });
    }
    const offerData = { priceCents: input.priceCents, compareAtCents: input.compareAtCents ?? null, currency: input.currency };
    if (defaultOffer) await tx.offer.update({ where: { id: defaultOffer.id }, data: offerData });
    else await tx.offer.create({ data: { ...offerData, productId: id, name: "Preço principal", isDefault: true } });
    return product;
  });
}

export async function setProductStatus(id: string, status: ProductStatus, scope: Scope) {
  const existing = await getProduct(id, scope);
  if (status === "PUBLISHED" && !existing.offers.some((o) => o.isActive)) {
    throw new DomainError("Não é possível publicar um produto sem ofertas ativas.");
  }
  return prisma.product.update({
    where: { id },
    data: { status, archivedAt: status === "ARCHIVED" ? new Date() : null },
  });
}

export async function duplicateProduct(id: string, scope: Scope) {
  const p = await getProduct(id, scope);
  const copy = await prisma.product.create({
    data: {
      name: `${p.name} (cópia)`.slice(0, 120),
      description: p.description,
      imageUrl: p.imageUrl,
      type: p.type,
      category: p.category,
      status: "DRAFT",
      salesPageUrl: p.salesPageUrl,
      supportEmail: p.supportEmail,
      deliveryUrl: p.deliveryUrl,
      ...own(scope),
      offers: {
        create: p.offers.map((o) => ({
          name: o.name,
          priceCents: o.priceCents,
          compareAtCents: o.compareAtCents,
          currency: o.currency,
          billingType: o.billingType,
          maxInstallments: o.maxInstallments,
          isDefault: o.isDefault,
          isActive: o.isActive,
        })),
      },
    },
  });
  // a cópia recebe o seu próprio checkout e link (nunca partilha o do original)
  await ensurePrimaryCheckout(copy.id);
  return copy;
}

export async function addOffer(productId: string, input: OfferInput, scope: Scope) {
  await getProduct(productId, scope);
  return prisma.offer.create({
    data: {
      productId,
      name: input.name,
      priceCents: input.priceCents,
      currency: input.currency,
      billingType: input.billingType,
      maxInstallments: input.billingType === "INSTALLMENTS" ? input.maxInstallments : 1,
      isActive: input.isActive,
    },
  });
}

export async function setOfferActive(offerId: string, active: boolean, scope: Scope) {
  const offer = await prisma.offer.findFirst({ where: { id: offerId, product: own(scope) } });
  if (!offer) throw new NotFoundError("Oferta");
  if (offer.isDefault && !active) throw new DomainError("O preço principal não pode ser desativado.");
  return prisma.offer.update({ where: { id: offerId }, data: { isActive: active } });
}

/** Produtos e ofertas para seletores (checkouts, funis, cupões). */
export async function listProductOptions(scope: Scope) {
  return prisma.product.findMany({
    where: { ...own(scope), status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      offers: { where: { isActive: true }, select: { id: true, name: true, priceCents: true, currency: true, isDefault: true }, orderBy: { isDefault: "desc" } },
    },
  });
}
export type ProductOption = Awaited<ReturnType<typeof listProductOptions>>[number];
