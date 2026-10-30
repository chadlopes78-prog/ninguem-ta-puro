import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "@/server/db";
import { newOrderCode } from "@/lib/ids";
import { canTransition, computeOrderTotals } from "./order-logic";
import { DomainError, NotFoundError } from "./products";
import { applyPaymentStatus, audit, newDeliveryToken } from "@/server/payments/confirm";
import { getProviderForPayment } from "@/server/payments/registry";
import { own, type Scope } from "@/server/scope";

export const ORDER_STATUSES: OrderStatus[] = ["PENDING", "APPROVED", "DECLINED", "REFUNDED", "CANCELED"];

export interface OrderFilter {
  scope: Scope;
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
  const where: Prisma.OrderWhereInput = { ...own(f.scope) };
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
        // última tentativa: justificativa do resultado (cancelado pelo cliente, saldo insuficiente, …)
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { failureReason: true, failureCode: true } },
      },
    }),
  ]);
  return { total, rows, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getOrder(id: string, scope: Scope) {
  const o = await prisma.order.findFirst({
    where: { id, ...own(scope) },
    include: {
      customer: true,
      items: { include: { product: { select: { id: true, name: true } }, offer: { select: { name: true } } } },
      checkout: { select: { id: true, name: true, publicId: true } },
      funnel: { select: { id: true, name: true } },
      coupon: { select: { id: true, code: true } },
      paymentEvents: { orderBy: { receivedAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
      auditLogs: { orderBy: { createdAt: "desc" } },
      delivery: { select: { token: true, accessCount: true, lastAccessAt: true } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!o) throw new NotFoundError("Pedido");
  return o;
}

export async function upsertCustomer(
  tx: Prisma.TransactionClient,
  data: { email: string; name: string; phone?: string; document?: string },
  scope: Scope,
) {
  const email = data.email.toLowerCase().trim();
  // Clientes são de cada conta: o mesmo email em duas lojas são dois clientes distintos
  return tx.customer.upsert({
    where: { ownerId_email_isDemo: { ownerId: scope.ownerId, email, isDemo: scope.isDemo } },
    create: { email, name: data.name, phone: data.phone ?? null, document: data.document ?? null, ...own(scope) },
    update: { name: data.name, ...(data.phone ? { phone: data.phone } : {}), ...(data.document ? { document: data.document } : {}) },
  });
}

/** Pedido manual de teste. Nunca aprovado fora do modo de demonstração. */
export async function createManualOrder(
  input: { productId: string; offerId: string; customerName: string; customerEmail: string; status: OrderStatus; notes?: string },
  scope: Scope,
) {
  const isDemo = scope.isDemo;
  if (input.status === "APPROVED" && !isDemo) {
    throw new DomainError("Pedidos só podem ser aprovados com confirmação válida do processador de pagamentos.");
  }
  if (input.status === "REFUNDED") throw new DomainError("Estado inicial inválido.");
  const offer = await prisma.offer.findFirst({ where: { id: input.offerId, productId: input.productId, product: own(scope) }, include: { product: true } });
  if (!offer) throw new DomainError("Produto ou oferta inexistente.");
  const totals = computeOrderTotals([{ unitPriceCents: offer.priceCents, quantity: 1 }], 0);
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const customer = await upsertCustomer(tx, { email: input.customerEmail, name: input.customerName }, scope);
    return tx.order.create({
      data: {
        code: newOrderCode(),
        customerId: customer.id,
        status: input.status,
        source: isDemo ? "DEMO" : "MANUAL_TEST",
        currency: offer.currency,
        ...totals,
        notes: input.notes ?? null,
        ...own(scope),
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

export async function changeOrderStatus(id: string, to: OrderStatus, scope: Scope, actor = "admin") {
  const isDemo = scope.isDemo;
  const order = await prisma.order.findFirst({ where: { id, ...own(scope) } });
  if (!order) throw new NotFoundError("Pedido");
  const check = canTransition(order.status, to, { isDemo });
  if (!check.ok) throw new DomainError(check.reason);

  // Encomenda real com pagamento pendente no fornecedor: cancelar primeiro no fornecedor
  if (!isDemo && to === "CANCELED") {
    const pending = await prisma.payment.findMany({ where: { orderId: id, status: { in: ["CREATED", "PENDING"] }, externalId: { not: null } } });
    for (const p of pending) {
      // credenciais gravadas no pagamento (partilha do administrador) ou da conta dona da encomenda
      const provider = await getProviderForPayment(p, order.ownerId);
      if (!provider?.cancel) continue;
      const r = await provider.cancel(p.externalId!, `Encomenda ${order.code} cancelada na loja`);
      if (!r.ok) {
        if (r.alreadyPaid) {
          const st = provider.getStatus ? await provider.getStatus(p.externalId, p.idempotencyKey).catch(() => null) : null;
          if (st) await applyPaymentStatus(provider.id, st, "status-check");
          throw new DomainError("O processador indica que este pagamento já foi pago: a encomenda não foi cancelada e o estado foi atualizado. Para devolver o dinheiro, peça o reembolso no painel da EPay.");
        }
        throw new DomainError("Não foi possível cancelar o pagamento no processador. Tente novamente dentro de instantes.");
      }
      await prisma.payment.update({ where: { id: p.id }, data: { status: "CANCELED", rawStatus: "cancelled", lastCheckedAt: new Date() } });
    }
  }
  const now = new Date();
  // updateMany com o estado anterior como condição evita alterações concorrentes
  await prisma.$transaction(async (tx) => {
  const res = await tx.order.updateMany({
    where: { id, status: order.status },
    data: {
      status: to,
      ...(to === "APPROVED" ? { approvedAt: now } : {}),
      ...(to === "REFUNDED" ? { refundedAt: now } : {}),
      ...(to === "CANCELED" ? { canceledAt: now } : {}),
    },
  });
  if (res.count !== 1) throw new DomainError("O pedido foi alterado entretanto. Atualize a página.");
  await audit(tx, id, order.status, to, actor, isDemo ? "Alteração manual (demonstração)" : "Alteração manual");
  if (to === "APPROVED") await tx.delivery.upsert({ where: { orderId: id }, create: { orderId: id, token: newDeliveryToken() }, update: {} });
  // Reembolso total (só possível em demonstração): fica registado para os relatórios por data de reembolso
  if (to === "REFUNDED") {
    const done = await tx.refund.aggregate({ where: { orderId: id }, _sum: { amountCents: true } });
    const remaining = order.totalCents - (done._sum.amountCents ?? 0);
    if (remaining > 0) await tx.refund.create({ data: { orderId: id, amountCents: remaining, currency: order.currency, reason: "Reembolso total", actor, ...own(scope) } });
  }
  });
}

// ───────────── Clientes ─────────────

export async function listCustomers(params: { scope: Scope; q?: string; hasPurchases?: boolean }) {
  const where: Prisma.CustomerWhereInput = { ...own(params.scope) };
  if (params.q) where.OR = [{ name: { contains: params.q, mode: "insensitive" } }, { email: { contains: params.q, mode: "insensitive" } }];
  if (params.hasPurchases) where.orders = { some: { status: "APPROVED" } };
  const customers = await prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  const ids = customers.map((c) => c.id);
  const [agg, approved] = await Promise.all([
    prisma.order.groupBy({ by: ["customerId"], where: { customerId: { in: ids }, ...own(params.scope) }, _count: { _all: true }, _min: { createdAt: true } }),
    prisma.order.groupBy({ by: ["customerId", "currency"], where: { customerId: { in: ids }, ...own(params.scope), status: "APPROVED", isTestPayment: false }, _sum: { totalCents: true } }),
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

export async function getCustomer(id: string, scope: Scope) {
  const c = await prisma.customer.findFirst({
    where: { id, ...own(scope) },
    include: { orders: { orderBy: { createdAt: "desc" }, include: { items: { select: { description: true } } } } },
  });
  if (!c) throw new NotFoundError("Cliente");
  return c;
}
