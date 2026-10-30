import { Prisma, type ProductStatus, type ProductType } from "@prisma/client";
import { prisma } from "@/server/db";
import { createPrimaryCheckoutTx, ensurePrimaryCheckout } from "./primary-checkout";
import { PRODUCT_MEDIA_PATH, type OfferInput, type ProductInput } from "@/server/validation/schemas";
import { assertOwnMedia } from "./media";
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
  status?: ProductStatus | "ALL" | "ACTIVE" | "DRAFTS";
  type?: ProductType;
  sort?: "newest" | "oldest" | "name" | "price_desc" | "price_asc" | "orders";
}

export async function listProducts(query: ProductListQuery) {
  const where: Prisma.ProductWhereInput = { ...own(query.scope) };
  if (query.q) where.OR = [{ name: { contains: query.q, mode: "insensitive" } }, { category: { contains: query.q, mode: "insensitive" } }];
  if (!query.status || query.status === "ACTIVE") where.status = { not: "ARCHIVED" };
  else if (query.status === "DRAFTS") where.status = { in: ["DRAFT", "UNPUBLISHED"] };
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
    include: { offers: { orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] }, deliveryFile: { select: { id: true, filename: true, sizeBytes: true } }, _count: { select: { orderItems: true, checkouts: true } } },
  });
  if (!product) throw new NotFoundError("Produto");
  return product;
}

/**
 * Dados do produto vindos do formulário. O estado PUBLICADO nunca é escrito aqui: só publishProduct() o faz,
 * depois da validação centralizada. O link de entrega e o email de suporte só mudam quando são enviados
 * (a entrega e o suporte WhatsApp configuram-se no funil do produto).
 */
function productData(input: ProductInput, currentStatus?: ProductStatus) {
  const status: ProductStatus = input.status === "PUBLISHED" ? (currentStatus === "PUBLISHED" ? "PUBLISHED" : (currentStatus ?? "DRAFT")) : input.status;
  return {
    name: input.name,
    description: input.description,
    imageUrl: input.imageUrl ?? null,
    bannerUrl: input.bannerUrl ?? null,
    type: input.type,
    category: input.category ?? null,
    status,
    // "Página de vendas" saiu do formulário: só é alterada se vier no pedido (o valor guardado mantém-se)
    ...(input.salesPageUrl !== undefined ? { salesPageUrl: input.salesPageUrl } : {}),
    ...(input.supportEmail !== undefined ? { supportEmail: input.supportEmail } : {}),
    ...(input.deliveryUrl !== undefined ? { deliveryUrl: input.deliveryUrl } : {}),
    // Entrega do produto (secção do formulário): só muda quando é enviada
    ...(input.deliveryMethod !== undefined ? { deliveryMethod: input.deliveryMethod } : {}),
    ...(input.deliveryMethod === "EXTERNAL_LINK" && input.accessUrl !== undefined ? { deliveryUrl: input.accessUrl || null } : {}),
  };
}

/**
 * Um produto publicado não pode ficar sem entrega: os compradores ficariam sem acesso.
 * (Rascunhos podem ser guardados incompletos — a publicação volta a validar tudo.)
 */
function assertDeliveryKeepsWorking(input: ProductInput, existing: { status: ProductStatus; deliveryFileId: string | null; deliveryUrl: string | null }) {
  if (existing.status !== "PUBLISHED" || input.deliveryMethod === undefined) return;
  if (input.deliveryMethod === "FILE" && !existing.deliveryFileId) throw new DomainError("O produto está publicado: carregue o ficheiro do produto antes de mudar a entrega para ficheiro.");
  if (input.deliveryMethod === "EXTERNAL_LINK" && !(input.accessUrl ?? existing.deliveryUrl)) throw new DomainError("O produto está publicado: indique o link de acesso ao produto.");
}

/**
 * Cria o produto, o preço principal e o checkout principal (com link público) numa única transação:
 * ou fica tudo criado, ou nada fica criado. Se algo falhar depois (ex.: produto antigo sem checkout),
 * ensurePrimaryCheckout() recupera a associação de forma idempotente.
 */
/** A imagem carregada tem de pertencer à biblioteca da própria conta (IDs alterados no browser são recusados). */
async function assertProductImage(imageUrl: string | undefined, scope: Scope) {
  const m = imageUrl ? PRODUCT_MEDIA_PATH.exec(imageUrl) : null;
  if (m && !(await assertOwnMedia(scope.ownerId, [m[1]]))) throw new DomainError("A imagem escolhida não pertence a esta conta. Carregue a imagem novamente.");
}

export async function createProduct(input: ProductInput, scope: Scope) {
  await assertProductImage(input.imageUrl, scope);
  await assertProductImage(input.bannerUrl, scope);
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const product = await tx.product.create({
          data: {
            // um produto novo nunca nasce publicado: fica em rascunho até cumprir os requisitos
            ...(input.deliveryUrl && !input.deliveryMethod ? { deliveryMethod: "EXTERNAL_LINK" as const } : {}),
            ...productData(input, "DRAFT"),
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
  if (input.imageUrl !== (existing.imageUrl ?? undefined)) await assertProductImage(input.imageUrl, scope);
  if (input.bannerUrl !== (existing.bannerUrl ?? undefined)) await assertProductImage(input.bannerUrl, scope);
  if (existing.status === "ARCHIVED") throw new DomainError("Produtos arquivados não podem ser editados. Restaure-o primeiro.");
  const defaultOffer = existing.offers.find((o) => o.isDefault);
  const wantsPublish = input.status === "PUBLISHED" && existing.status !== "PUBLISHED";
  assertDeliveryKeepsWorking(input, existing);
  const updated = await prisma.$transaction(async (tx) => {
    const product = await tx.product.update({
      where: { id },
      data: { ...(input.deliveryUrl && !existing.deliveryMethod && !input.deliveryMethod ? { deliveryMethod: "EXTERNAL_LINK" as const } : {}), ...productData(input, existing.status) },
    });
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
    // "Preço de referência" saiu do formulário: o valor guardado mantém-se, exceto se deixar de fazer sentido
    // (preço principal igual ou superior ao preço riscado — o mesmo critério da validação anterior)
    const keptCompareAt = defaultOffer?.compareAtCents && defaultOffer.compareAtCents > input.priceCents ? defaultOffer.compareAtCents : null;
    const offerData = { priceCents: input.priceCents, compareAtCents: input.compareAtCents !== undefined ? input.compareAtCents : keptCompareAt, currency: input.currency };
    if (defaultOffer) await tx.offer.update({ where: { id: defaultOffer.id }, data: offerData });
    else await tx.offer.create({ data: { ...offerData, productId: id, name: "Preço principal", isDefault: true } });
    return product;
  });
  // Publicar a partir do formulário passa pela mesma validação do botão "Publicar" (os outros dados ficam guardados)
  if (wantsPublish) return publishProduct(id, scope);
  return updated;
}

/**
 * Publica um produto: validação centralizada no servidor (funil, página de obrigado, suporte WhatsApp,
 * entrega…), ativa o funil principal no checkout principal e só depois marca o produto como publicado.
 * Lança PublishBlockedError com a lista do que falta.
 */
export async function publishProduct(id: string, scope: Scope) {
  const { assertPublishable } = await import("./product-readiness");
  const r = await assertPublishable(id, scope);
  const primary = await ensurePrimaryCheckout(id);
  if (!primary.isActive) await prisma.checkout.update({ where: { id: primary.id }, data: { isActive: true } });
  if (r.mainFunnelId) {
    // as compras do checkout principal seguem o funil principal (página de obrigado e entrega corretas)
    const { activateWizardFunnel } = await import("./funnel-wizard");
    const v = await activateWizardFunnel(r.mainFunnelId, scope);
    if (!v.valid) throw new DomainError(v.errors[0]?.message ?? "Não foi possível ativar o funil principal.");
  }
  return prisma.product.update({ where: { id }, data: { status: "PUBLISHED", archivedAt: null } });
}

export async function setProductStatus(id: string, status: ProductStatus, scope: Scope) {
  const existing = await getProduct(id, scope);
  if (status === "PUBLISHED" && !existing.offers.some((o) => o.isActive)) {
    throw new DomainError("Não é possível publicar um produto sem ofertas ativas.");
  }
  if (status === "PUBLISHED") return existing.status === "PUBLISHED" ? existing : publishProduct(id, scope);
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
      bannerUrl: p.bannerUrl,
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
