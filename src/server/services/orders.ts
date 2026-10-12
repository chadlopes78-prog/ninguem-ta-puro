import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { newOrderCode } from "@/lib/ids";
import { canTransition, computeOrderTotals } from "./order-logic";
import { DomainError, NotFoundError } from "./products";

export const ORDER_STATUSES: OrderStatus[] = ["PENDING", "APPROVED", "DECLINED", "REFUNDED", "CANCELED"];

export interface OrderFilter {
  isDemo: boolean;
  status?: OrderStatus;
  q?: string;
  from?: Date;
  to?: Date;
  productId?: string;
  checkoutId?: string;
  page?: number;
  pageSize?: number;
}

export function buildOrderWhere(f: OrderFilter): Prisma.OrderWhereInput {
  const where: Prisma.OrderWhereInput = { isDemo: f.isDemo };
  if (f.status) where.status = f.status;
  if (f.from || f.to) where.createdAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) };
  if (f.productId) where.items = { some: { productId: f.productId } };
  if (f.checkoutId) where.checkoutId = f.checkoutId;
  if (f.q) {
    const q = f.q.trim();
    where.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { customer: { email: { contains: q, mode: "insensitive" } } },
      { customer: { name: { contains: q, mode: "insensitive" } } },
    ];
  }
  return where;
}

export async function listOrders(f: OrderFilter) {
  const pageSize = Math.min(f.pageSize ?? 25, 100);
  const page = Math.max(1, f.page ?? 1);
  const where = buildOrderWhere(f);
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        customer: { select: { id: true, name: true, email: true } },
        items: { select: { description: true, kind: true, product: { select: { name: true } } } },
      },
    }),
  ]);
  return { total, rows, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getOrder(id: string, isDemo: boolean) {
  const o = await prisma.order.findFirst({
    where: { id, isDemo },
    include: {
      customer: true,
      items: { include: { product: { select: { id: true, name: true } }, offer: { select: { name: true } } } },
      checkout: { select: { id: true, name: true, publicId: true } },
      funnel: { select: { id: true, name: true } },
      coupon: { select: { id: true, code: true } },
      paymentEvents: { orderBy: { receivedAt: "desc" } },
    },
  });
  if (!o) throw new NotFoundError("Pedido");
  return o;
}

export async function upsertCustomer(
  tx: Prisma.TransactionClient,
  data: { email: string; name: string; phone?: string; document?: string },
  isDemo: boolean,
) {
  const email = data.email.toLowerCase().trim();
  return tx.customer.upsert({
    where: { email_isDemo: { email, isDemo } },
    create: { email, name: data.name, phone: data.phone ?? null, document: data.document ?? null, isDemo },
    update: { name: data.name, ...(data.phone ? { phone: data.phone } : {}), ...(data.document ? { document: data.document } : {}) },
  });
}

/** Pedido manual de teste. Nunca aprovado fora do modo de demonstração. */
export async function createManualOrder(
  input: { productId: string; offerId: string; customerName: string; customerEmail: string; status: OrderStatus; notes?: string },
  isDemo: boolean,
) {
  if (input.status === "APPROVED" && !isDemo) {
    throw new DomainError("Pedidos só podem ser aprovados com confirmação válida do processador de pagamentos.");
  }
  if (input.status === "REFUNDED") throw new DomainError("Estado inicial inválido.");
  const offer = await prisma.offer.findFirst({ where: { id: input.offerId, productId: input.productId, product: { isDemo } }, include: { product: true } });
  if (!offer) throw new DomainError("Produto ou oferta inexistente.");
  const totals = computeOrderTotals([{ unitPriceCents: offer.priceCents, quantity: 1 }], 0);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const customer = await upsertCustomer(tx, { email: input.customerEmail, name: input.customerName }, isDemo);
    return tx.order.create({
      data: {
        code: newOrderCode(),
        customerId: customer.id,
        status: input.status,
        source: isDemo ? "DEMO" : "MANUAL_TEST",
        currency: offer.currency,
        ...totals,
        notes: input.notes ?? null,
        isDemo,
        approvedAt: input.status === "APPROVED" ? now : null,
        canceledAt: input.status === "CANCELED" ? now : null,
        items: {
          create: {
            productId: offer.productId,
            offerId: offer.id,
            kind: "MAIN",
            description: `${offer.product.name} — ${offer.name}`,
            unitPriceCents: offer.priceCents,
            quantity: 1,
            totalCents: offer.priceCents,
          },
        },
      },
    });
  });
}

export async function changeOrderStatus(id: string, to: OrderStatus, isDemo: boolean) {
  const order = await prisma.order.findFirst({ where: { id, isDemo } });
  if (!order) throw new NotFoundError("Pedido");
  const check = canTransition(order.status, to, { isDemo });
  if (!check.ok) throw new DomainError(check.reason);
  const now = new Date();
  // updateMany com o estado anterior como condição evita alterações concorrentes
  const res = await prisma.order.updateMany({
    where: { id, status: order.status },
    data: {
      status: to,
      ...(to === "APPROVED" ? { approvedAt: now } : {}),
      ...(to === "REFUNDED" ? { refundedAt: now } : {}),
      ...(to === "CANCELED" ? { canceledAt: now } : {}),
    },
  });
  if (res.count !== 1) throw new DomainError("O pedido foi alterado entretanto. Atualize a página.");
}

// ───────────── Clientes ─────────────

export async function listCustomers(params: { isDemo: boolean; q?: string; hasPurchases?: boolean }) {
  const where: Prisma.CustomerWhereInput = { isDemo: params.isDemo };
  if (params.q) where.OR = [{ name: { contains: params.q, mode: "insensitive" } }, { email: { contains: params.q, mode: "insensitive" } }];
  if (params.hasPurchases) where.orders = { some: { status: "APPROVED" } };
  const customers = await prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  const ids = customers.map((c) => c.id);
  const [agg, approved] = await Promise.all([
    prisma.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids } }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.order.groupBy({ by: ["customerId", "currency"], where: { customerId: { in: ids }, status: "APPROVED" }, _sum: { totalCents: true } }),
  ]);
  return customers.map((c) => {
    const a = agg.find((x) => x.customerId === c.id);
    return {
      ...c,
      ordersCount: a?._count._all ?? 0,
      firstOrderAt: a?._min.createdAt ?? null,
      confirmed: approved.filter((x) => x.customerId === c.id).map((x) => ({ currency: x.currency, cents: x._sum.totalCents ?? 0 })),
    };
  });
}

export async function getCustomer(id: string, isDemo: boolean) {
  const c = await prisma.customer.findFirst({
    where: { id, isDemo },
    include: { orders: { orderBy: { createdAt: "desc" }, include: { items: { select: { description: true } } } } },
  });
  if (!c) throw new NotFoundError("Cliente");
  return c;
}
