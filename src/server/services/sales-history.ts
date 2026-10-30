// Limpar o histórico de vendas de UMA conta (ex.: depois de fazer compras de teste com o próprio telemóvel).
// Elimina permanentemente os pedidos escolhidos e tudo o que deles depende (pagamentos, avisos dos gateways,
// entregas, reembolsos, notificações de venda e eventos) — o Dashboard, Operações e Relatórios deixam de os contar.
// Nunca toca em produtos, checkouts, funis, integrações nem nos dados de demonstração.
import { prisma } from "@/server/db";
import { NotFoundError } from "./products";

export type ClearMode = "test" | "all";

const real = (ownerId: string) => ({ ownerId, isDemo: false as const });

export async function salesHistoryCounts(ownerId: string) {
  const [orders, testOrders] = await Promise.all([
    prisma.order.count({ where: real(ownerId) }),
    prisma.order.count({ where: { ...real(ownerId), isTestPayment: true } }),
  ]);
  return { orders, testOrders };
}

/** Pedidos a eliminar + os upsells/downsells que deles dependem (uma compra nunca fica a meio). */
async function withChildren(ownerId: string, ids: string[]) {
  const all = new Set(ids);
  let frontier = ids;
  while (frontier.length) {
    const kids = await prisma.order.findMany({ where: { ...real(ownerId), parentOrderId: { in: frontier } }, select: { id: true } });
    frontier = kids.map((k) => k.id).filter((id) => !all.has(id));
    frontier.forEach((id) => all.add(id));
  }
  return [...all];
}

async function deleteOrders(ownerId: string, ids: string[], extra: "none" | "everything") {
  if (!ids.length && extra === "none") return 0;
  return prisma.$transaction(async (tx) => {
    // os avisos dos gateways e os eventos ficariam órfãos (orderId → null): são apagados com o pedido
    await tx.paymentEvent.deleteMany({ where: { orderId: { in: ids } } });
    await tx.analyticsEvent.deleteMany({ where: { ...real(ownerId), orderId: { in: ids } } });
    await tx.notification.deleteMany({ where: { userId: ownerId, OR: [{ orderId: { in: ids } }, { eventKey: { in: ids.map((id) => `sale:${id}`) } }] } });
    // upsells primeiro (a compra inicial não pode ser apagada enquanto tiver upsells)
    const children = await tx.order.findMany({ where: { id: { in: ids }, parentOrderId: { not: null } }, select: { id: true } });
    await tx.order.deleteMany({ where: { id: { in: children.map((c) => c.id) } } });
    const { count } = await tx.order.deleteMany({ where: { ...real(ownerId), id: { in: ids } } });
    if (extra === "everything") {
      // histórico completo: também as visitas, percursos de funil, metas celebradas e resumos
      await tx.funnelRun.deleteMany({ where: real(ownerId) });
      await tx.analyticsEvent.deleteMany({ where: real(ownerId) });
      await tx.checkoutSession.deleteMany({ where: real(ownerId) });
      await tx.revenueMilestone.deleteMany({ where: { userId: ownerId } });
      await tx.notification.deleteMany({ where: { userId: ownerId, OR: [{ eventKey: { startsWith: "sale:" } }, { eventKey: { startsWith: "refund:" } }, { eventKey: { startsWith: "daily:" } }] } });
    }
    // clientes que ficaram sem nenhum pedido
    await tx.customer.deleteMany({ where: { ...real(ownerId), orders: { none: {} } } });
    return count + children.length;
  });
}

/** «test»: só os pagamentos de teste; «all»: todo o histórico de vendas da conta. Devolve quantos pedidos foram eliminados. */
export async function clearSalesHistory(ownerId: string, mode: ClearMode) {
  const roots = await prisma.order.findMany({ where: { ...real(ownerId), ...(mode === "test" ? { isTestPayment: true } : {}) }, select: { id: true } });
  const ids = await withChildren(ownerId, roots.map((r) => r.id));
  return deleteOrders(ownerId, ids, mode === "all" ? "everything" : "none");
}

/** Elimina um pedido (e os seus upsells) da conta. */
export async function deleteOrder(ownerId: string, orderId: string) {
  const o = await prisma.order.findFirst({ where: { ...real(ownerId), id: orderId }, select: { id: true } });
  if (!o) throw new NotFoundError("Pedido");
  return deleteOrders(ownerId, await withChildren(ownerId, [o.id]), "none");
}
