import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { staticAppBaseUrl } from "@/server/app-url";
import { newCheckoutPublicId } from "@/lib/ids";
import type { CheckoutInput } from "@/server/validation/schemas";
import { DomainError, NotFoundError } from "./products";
import { own, type Scope } from "@/server/scope";

export function checkoutUrl(publicId: string, base = staticAppBaseUrl().url ?? ""): string {
  return `${base.replace(/\/$/, "")}/checkout/${publicId}`;
}

export async function listCheckouts(params: { scope: Scope; q?: string; state?: "active" | "inactive" | "all" }) {
  const where: Prisma.CheckoutWhereInput = { ...own(params.scope) };
  if (params.q) where.OR = [{ name: { contains: params.q, mode: "insensitive" } }, { title: { contains: params.q, mode: "insensitive" } }];
  if (params.state === "active") where.isActive = true;
  if (params.state === "inactive") where.isActive = false;
  return prisma.checkout.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      product: { select: { id: true, name: true, status: true } },
      offer: { select: { id: true, name: true, priceCents: true, currency: true } },
      funnel: { select: { id: true, name: true, status: true } },
      _count: { select: { orders: true, sessions: true } },
    },
    take: 500,
  });
}

export async function getCheckout(id: string, scope: Scope) {
  const c = await prisma.checkout.findFirst({
    where: { id, ...own(scope) },
    include: { product: true, offer: true, funnel: { select: { id: true, name: true, status: true } } },
  });
  if (!c) throw new NotFoundError("Checkout");
  return c;
}

async function assertRefs(input: CheckoutInput, scope: Scope) {
  const offer = await prisma.offer.findFirst({
    where: { id: input.offerId, productId: input.productId, product: own(scope) },
    include: { product: true },
  });
  if (!offer) throw new DomainError("A oferta selecionada não pertence ao produto.");
  if (offer.product.status === "ARCHIVED") throw new DomainError("O produto está arquivado.");
  if (!offer.isActive) throw new DomainError("A oferta selecionada está inativa.");
  if (input.funnelId) {
    const funnel = await prisma.funnel.findFirst({ where: { id: input.funnelId, ...own(scope) } });
    if (!funnel) throw new DomainError("Funil inexistente.");
  }
}

function data(input: CheckoutInput) {
  return {
    name: input.name,
    productId: input.productId,
    offerId: input.offerId,
    title: input.title,
    description: input.description ?? null,
    imageUrl: input.imageUrl ?? null,
    buttonText: input.buttonText,
    primaryColor: input.primaryColor,
    backgroundColor: input.backgroundColor,
    collectPhone: input.collectPhone,
    requirePhone: input.requirePhone,
    collectDocument: input.collectDocument,
    requireDocument: input.requireDocument,
    allowCoupons: input.allowCoupons,
    successTitle: input.successTitle,
    successMessage: input.successMessage,
    successRedirectUrl: input.successRedirectUrl ?? null,
    supportEmail: input.supportEmail ?? null,
    funnelId: input.funnelId ?? null,
    isActive: input.isActive,
  };
}

export async function createCheckout(input: CheckoutInput, scope: Scope) {
  await assertRefs(input, scope);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.checkout.create({ data: { ...data(input), publicId: newCheckoutPublicId(), ...own(scope) } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Não foi possível gerar um identificador único");
}

export async function updateCheckout(id: string, input: CheckoutInput, scope: Scope) {
  await getCheckout(id, scope);
  await assertRefs(input, scope);
  return prisma.checkout.update({ where: { id }, data: data(input) });
}

export async function setCheckoutActive(id: string, active: boolean, scope: Scope) {
  await getCheckout(id, scope);
  return prisma.checkout.update({ where: { id }, data: { isActive: active } });
}

export async function duplicateCheckout(id: string, scope: Scope) {
  const c = await getCheckout(id, scope);
  // a cópia é um checkout adicional: nunca herda o endereço (slug) nem a marca de checkout principal
  const { id: _id, publicId: _p, slug: _s, primaryProductId: _pp, createdAt: _c, updatedAt: _u, product: _pr, offer: _o, funnel: _f, ...rest } = c;
  return prisma.checkout.create({ data: { ...rest, name: `${c.name} (cópia)`.slice(0, 120), isActive: false, publicId: newCheckoutPublicId() } });
}

export async function deleteCheckout(id: string, scope: Scope) {
  const c = await prisma.checkout.findFirst({ where: { id, ...own(scope) }, include: { _count: { select: { orders: true } } } });
  if (!c) throw new NotFoundError("Checkout");
  if (c.primaryProductId) throw new DomainError("Este é o checkout principal do produto e o seu link pode já ter sido partilhado. Desative-o em vez de o eliminar.");
  if (c._count.orders > 0) throw new DomainError("Este checkout tem pedidos associados. Desative-o em vez de o eliminar.");
  await prisma.checkout.delete({ where: { id } });
}

export type PublicCheckoutState =
  | { state: "ok"; checkout: Awaited<ReturnType<typeof getCheckout>> & { design: { published: Prisma.JsonValue | null } | null } }
  | { state: "unavailable" };

/** Checkout para a página pública. Não revela o motivo da indisponibilidade. */
export async function getPublicCheckout(publicIdOrSlug: string): Promise<PublicCheckoutState> {
  // Aceita o endereço legível (slug, ex.: handwriting-heroes) e o identificador aleatório antigo.
  const isPublicId = /^[A-Za-z0-9]{8,32}$/.test(publicIdOrSlug);
  const isSlug = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(publicIdOrSlug);
  if (!isPublicId && !isSlug) return { state: "unavailable" };
  const include = { product: true, offer: true, funnel: { select: { id: true, name: true, status: true } }, design: { select: { published: true } } } as const;
  const withOwner = { ...include, owner: { select: { status: true, bannedAt: true } } } as const;
  const found =
    (isPublicId ? await prisma.checkout.findUnique({ where: { publicId: publicIdOrSlug }, include: withOwner }) : null) ??
    (isSlug ? await prisma.checkout.findUnique({ where: { slug: publicIdOrSlug }, include: withOwner }) : null);
  if (!found || !found.isActive || found.product.status !== "PUBLISHED" || !found.offer.isActive) return { state: "unavailable" };
  // Conta do vendedor suspensa, pendente ou rejeitada: o checkout deixa de vender (os dados mantêm-se)
  if (found.owner.status !== "APPROVED" || found.owner.bannedAt) return { state: "unavailable" };
  const { owner: _owner, ...c } = found;
  return { state: "ok", checkout: c };
}
