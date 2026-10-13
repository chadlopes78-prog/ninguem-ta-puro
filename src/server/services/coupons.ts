import { Prisma, type Coupon } from "@prisma/client";
import { prisma } from "@/server/db";
import { addDays, startOfZonedDay, zonedDayKey } from "@/lib/dates";
import type { CouponInput } from "@/server/validation/schemas";
import { evaluateCoupon, type CouponEvaluation } from "./coupon-logic";
import { DomainError, NotFoundError } from "./products";
import type { CurrencyCode } from "@/lib/money";
import { own, type Scope } from "@/server/scope";

export class DuplicateCodeError extends DomainError {
  constructor() {
    super("Já existe um cupão com este código.");
  }
}

export async function listCoupons(params: { scope: Scope; q?: string; state?: string }) {
  const where: Prisma.CouponWhereInput = { ...own(params.scope) };
  if (params.q) where.code = { contains: params.q.toUpperCase() };
  if (params.state === "active") where.isActive = true;
  if (params.state === "inactive") where.isActive = false;
  return prisma.coupon.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { products: { include: { product: { select: { id: true, name: true } } } }, _count: { select: { orders: true } } },
  });
}

export async function getCoupon(id: string, scope: Scope) {
  const c = await prisma.coupon.findFirst({ where: { id, ...own(scope) }, include: { products: true } });
  if (!c) throw new NotFoundError("Cupão");
  return c;
}

function toData(input: CouponInput, tz: string) {
  return {
    code: input.code,
    description: input.description ?? null,
    type: input.type,
    percentOff: input.percentOff,
    amountOffCents: input.amountOffCents,
    currency: input.currency,
    appliesToAll: input.appliesToAll,
    // início: 00:00 do dia; fim: inclusivo até ao final do dia indicado
    startsAt: input.startsAt ? startOfZonedDay(input.startsAt, tz) : null,
    endsAt: input.endsAt ? startOfZonedDay(addDays(input.endsAt, 1), tz) : null,
    maxUses: input.maxUses,
    isActive: input.isActive,
  };
}

async function assertProducts(ids: string[], scope: Scope) {
  if (!ids.length) return;
  const count = await prisma.product.count({ where: { id: { in: ids }, ...own(scope) } });
  if (count !== new Set(ids).size) throw new DomainError("Produto elegível inexistente.");
}

export async function createCoupon(input: CouponInput, scope: Scope, tz: string) {
  await assertProducts(input.productIds, scope);
  try {
    return await prisma.coupon.create({
      data: { ...toData(input, tz), ...own(scope), products: { create: input.productIds.map((productId) => ({ productId })) } },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DuplicateCodeError();
    throw e;
  }
}

export async function updateCoupon(id: string, input: CouponInput, scope: Scope, tz: string) {
  await getCoupon(id, scope);
  await assertProducts(input.productIds, scope);
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.couponProduct.deleteMany({ where: { couponId: id } });
      return tx.coupon.update({
        where: { id },
        data: { ...toData(input, tz), products: { create: input.productIds.map((productId) => ({ productId })) } },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DuplicateCodeError();
    throw e;
  }
}

export async function setCouponActive(id: string, active: boolean, scope: Scope) {
  await getCoupon(id, scope);
  return prisma.coupon.update({ where: { id }, data: { isActive: active } });
}

export async function deleteCoupon(id: string, scope: Scope) {
  const c = await prisma.coupon.findFirst({ where: { id, ...own(scope) }, include: { _count: { select: { orders: true } } } });
  if (!c) throw new NotFoundError("Cupão");
  if (c._count.orders > 0) throw new DomainError("Cupão já utilizado em pedidos. Desative-o em vez de o eliminar.");
  await prisma.coupon.delete({ where: { id } });
}

/** Avalia um código de cupão para um produto/moeda/subtotal. */
export async function evaluateCouponCode(
  code: string,
  ctx: { scope: Scope; productId: string; currency: CurrencyCode; subtotalCents: number; now?: Date },
): Promise<{ evaluation: CouponEvaluation; coupon: Coupon | null }> {
  const normalized = code.trim().toUpperCase();
  const coupon = normalized
    ? await prisma.coupon.findUnique({ where: { ownerId_code_isDemo: { ownerId: ctx.scope.ownerId, code: normalized, isDemo: ctx.scope.isDemo } }, include: { products: true } })
    : null;
  const evaluation = evaluateCoupon(
    coupon
      ? {
          ...coupon,
          currency: coupon.currency,
          productIds: coupon.products.map((p) => p.productId),
        }
      : null,
    { productId: ctx.productId, currency: ctx.currency, subtotalCents: ctx.subtotalCents, now: ctx.now ?? new Date() },
  );
  return { evaluation, coupon };
}

/** Consome uma utilização de forma atómica (protege o limite contra concorrência). */
export async function consumeCouponUse(tx: Prisma.TransactionClient, couponId: string): Promise<boolean> {
  const rows = await tx.$executeRaw`
    UPDATE "Coupon" SET "usesCount" = "usesCount" + 1, "updatedAt" = NOW()
    WHERE "id" = ${couponId} AND ("maxUses" IS NULL OR "usesCount" < "maxUses")`;
  return rows === 1;
}

export function couponDateKeys(c: Pick<Coupon, "startsAt" | "endsAt">, tz: string) {
  return {
    startsAt: c.startsAt ? zonedDayKey(c.startsAt, tz) : "",
    endsAt: c.endsAt ? addDays(zonedDayKey(c.endsAt, tz), -1) : "",
  };
}
