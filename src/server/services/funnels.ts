import { Prisma, type FunnelStepType } from "@prisma/client";
import { prisma } from "@/server/db";
import type { FunnelGraph, GraphNode, StepConfig } from "@/lib/funnels/types";
import { validateFunnel, type FunnelRefs, type FunnelValidation } from "@/lib/funnels/validate";
import { DomainError, NotFoundError } from "./products";
import { own, type Scope } from "@/server/scope";

export function defaultGraph(): FunnelGraph {
  return {
    nodes: [
      { key: "start", type: "START", label: "Início", position: { x: 0, y: 120 }, config: {} },
      { key: "checkout", type: "CHECKOUT", label: "Checkout principal", position: { x: 260, y: 120 }, config: {} },
      { key: "approved", type: "PURCHASE_APPROVED", label: "Compra aprovada", position: { x: 520, y: 120 }, config: {} },
      { key: "thanks", type: "THANK_YOU", label: "Obrigado", position: { x: 780, y: 120 }, config: { title: "Obrigado pela sua compra!" } },
    ],
    edges: [
      { key: "e-start-checkout", source: "start", target: "checkout", sourceHandle: "next" },
      { key: "e-checkout-approved", source: "checkout", target: "approved", sourceHandle: "next" },
      { key: "e-approved-thanks", source: "approved", target: "thanks", sourceHandle: "next" },
    ],
  };
}

export async function listFunnels(params: { scope: Scope; q?: string; status?: string }) {
  const where: Prisma.FunnelWhereInput = { ...own(params.scope) };
  if (params.q) where.name = { contains: params.q, mode: "insensitive" };
  if (params.status === "ACTIVE" || params.status === "INACTIVE" || params.status === "DRAFT") where.status = params.status;
  return prisma.funnel.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { steps: true, checkouts: true, orders: true } }, steps: { select: { type: true } }, product: { select: { name: true } } },
  });
}

export async function getFunnelRecord(id: string, scope: Scope) {
  const f = await prisma.funnel.findFirst({ where: { id, ...own(scope) }, include: { steps: true, edges: true } });
  if (!f) throw new NotFoundError("Funil");
  return f;
}

export function toGraph(f: { steps: { key: string; type: FunnelStepType; label: string; positionX: number; positionY: number; config: Prisma.JsonValue }[]; edges: { key: string; sourceKey: string; targetKey: string; sourceHandle: string }[] }): FunnelGraph {
  return {
    nodes: f.steps.map<GraphNode>((s) => ({
      key: s.key,
      type: s.type,
      label: s.label,
      position: { x: s.positionX, y: s.positionY },
      config: (s.config ?? {}) as StepConfig,
    })),
    edges: f.edges.map((e) => ({
      key: e.key,
      source: e.sourceKey,
      target: e.targetKey,
      sourceHandle: e.sourceHandle as "next" | "accept" | "decline",
    })),
  };
}

export async function loadRefs(scope: Scope): Promise<FunnelRefs> {
  const [products, checkouts] = await Promise.all([
    prisma.product.findMany({ where: own(scope), select: { id: true, name: true, status: true, offers: { select: { id: true, isActive: true } } } }),
    prisma.checkout.findMany({ where: own(scope), select: { id: true, name: true, isActive: true } }),
  ]);
  return {
    products: new Map(
      products.map((p) => [p.id, { name: p.name, archived: p.status === "ARCHIVED", offers: new Map(p.offers.map((o) => [o.id, { active: o.isActive }])) }]),
    ),
    checkouts: new Map(checkouts.map((c) => [c.id, { name: c.name, active: c.isActive }])),
  };
}

async function writeGraph(tx: Prisma.TransactionClient, funnelId: string, graph: FunnelGraph) {
  await tx.funnelEdge.deleteMany({ where: { funnelId } });
  await tx.funnelStep.deleteMany({ where: { funnelId } });
  if (graph.nodes.length) {
    await tx.funnelStep.createMany({
      data: graph.nodes.map((n) => ({
        funnelId,
        key: n.key,
        type: n.type,
        label: n.label,
        positionX: n.position.x,
        positionY: n.position.y,
        config: n.config as Prisma.InputJsonValue,
      })),
    });
  }
  const keys = new Set(graph.nodes.map((n) => n.key));
  const edges = graph.edges.filter((e) => keys.has(e.source) && keys.has(e.target));
  if (edges.length) {
    await tx.funnelEdge.createMany({
      data: edges.map((e) => ({ funnelId, key: e.key, sourceKey: e.source, targetKey: e.target, sourceHandle: e.sourceHandle })),
    });
  }
}

export async function createFunnel(meta: { name: string; description?: string }, scope: Scope, graph: FunnelGraph = defaultGraph()) {
  return prisma.$transaction(async (tx) => {
    const f = await tx.funnel.create({ data: { name: meta.name, description: meta.description ?? null, ...own(scope) } });
    await writeGraph(tx, f.id, graph);
    return f;
  });
}

export async function saveFunnel(
  id: string,
  input: { name: string; description?: string; graph: FunnelGraph },
  scope: Scope,
): Promise<{ validation: FunnelValidation; deactivated: boolean }> {
  const funnel = await getFunnelRecord(id, scope);
  const validation = validateFunnel(input.graph, await loadRefs(scope));
  const deactivated = funnel.status === "ACTIVE" && !validation.valid;
  await prisma.$transaction(async (tx) => {
    await tx.funnel.update({
      where: { id },
      data: { name: input.name, description: input.description ?? null, ...(deactivated ? { status: "DRAFT" } : {}) },
    });
    await writeGraph(tx, id, input.graph);
  });
  return { validation, deactivated };
}

export async function validateStoredFunnel(id: string, scope: Scope): Promise<FunnelValidation> {
  const f = await getFunnelRecord(id, scope);
  return validateFunnel(toGraph(f), await loadRefs(scope));
}

export async function activateFunnel(id: string, scope: Scope): Promise<FunnelValidation> {
  const f = await getFunnelRecord(id, scope);
  const graph = toGraph(f);
  const validation = validateFunnel(graph, await loadRefs(scope));
  if (!validation.valid) return validation;

  const checkoutIds = graph.nodes.filter((n) => n.type === "CHECKOUT" && n.config.checkoutId).map((n) => n.config.checkoutId!);
  const conflicts = await prisma.checkout.findMany({
    where: { id: { in: checkoutIds }, ...own(scope), funnelId: { not: id }, funnel: { status: "ACTIVE" } },
    include: { funnel: true },
  });
  if (conflicts.length) {
    return {
      valid: false,
      warnings: validation.warnings,
      errors: conflicts.map((c) => ({
        level: "error" as const,
        message: `O checkout “${c.name}” já está associado ao funil ativo “${c.funnel?.name}”.`,
      })),
    };
  }
  await prisma.$transaction([
    prisma.funnel.update({ where: { id }, data: { status: "ACTIVE" } }),
    prisma.checkout.updateMany({ where: { id: { in: checkoutIds }, ...own(scope) }, data: { funnelId: id } }),
  ]);
  return validation;
}

export async function deactivateFunnel(id: string, scope: Scope) {
  await getFunnelRecord(id, scope);
  const mainOf = await prisma.product.findFirst({ where: { mainFunnelId: id, status: "PUBLISHED", ...own(scope) } });
  if (mainOf) throw new DomainError(`Este é o funil principal do produto publicado “${mainOf.name}”: despublique o produto antes de desativar o funil.`);
  return prisma.funnel.update({ where: { id }, data: { status: "INACTIVE" } });
}

export async function duplicateFunnel(id: string, scope: Scope) {
  const f = await getFunnelRecord(id, scope);
  const copy = await createFunnel({ name: `${f.name} (cópia)`.slice(0, 100), description: f.description ?? undefined }, scope, toGraph(f));
  // Funis do assistente: a cópia mantém o produto inicial e a página de obrigado (fica em rascunho)
  if (f.productId) {
    const page = await prisma.thankYouPage.findUnique({ where: { funnelId: f.id } });
    await prisma.$transaction([
      prisma.funnel.update({ where: { id: copy.id }, data: { productId: f.productId } }),
      ...(page ? [prisma.thankYouPage.create({ data: { funnelId: copy.id, design: page.design ?? {}, action: page.action ?? {}, fileId: page.fileId } })] : []),
    ]);
  }
  return copy;
}

export async function deleteFunnel(id: string, scope: Scope) {
  const f = await prisma.funnel.findFirst({ where: { id, ...own(scope) }, include: { _count: { select: { orders: true } } } });
  if (!f) throw new NotFoundError("Funil");
  if (f.status === "ACTIVE") throw new DomainError("Desative o funil antes de o eliminar.");
  if (f._count.orders > 0) throw new DomainError("Este funil tem pedidos associados e não pode ser eliminado.");
  const mainOf = await prisma.product.findFirst({ where: { mainFunnelId: id, status: "PUBLISHED", ...own(scope) } });
  if (mainOf) throw new DomainError(`Este é o funil principal do produto publicado “${mainOf.name}” e não pode ser eliminado.`);
  await prisma.funnel.delete({ where: { id } });
}
