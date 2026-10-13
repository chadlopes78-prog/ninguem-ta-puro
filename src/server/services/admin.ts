// Administração da Plataforma (exclusiva da conta OWNER). Cada função recebe o administrador autenticado e
// volta a verificar a permissão no servidor — esconder o menu nunca substitui esta verificação.
// Nunca devolve segredos: as integrações das contas aparecem apenas como estados.
import "server-only";
import type { AccountStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { AuthUser } from "@/server/auth/service";
import { accountState, canAdminister, canApplyAdminAction, type AdminAction } from "@/server/auth/policy";
import { integrationStatesForAdmin } from "./integrations";
import { DomainError, NotFoundError } from "./products";

export class ForbiddenError extends Error {}

function assertAdmin(actor: AuthUser) {
  if (!canAdminister(actor)) throw new ForbiddenError("Sem permissão.");
}

const ACTIVE_WINDOW_MS = 30 * 86_400_000;

export const USER_FILTERS = ["all", "pending", "approved", "rejected", "banned"] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

function filterWhere(f: UserFilter): Prisma.UserWhereInput {
  switch (f) {
    case "pending":
      return { status: "PENDING_APPROVAL", bannedAt: null };
    case "approved":
      return { status: "APPROVED", bannedAt: null };
    case "rejected":
      return { status: "REJECTED", bannedAt: null };
    case "banned":
      return { bannedAt: { not: null } };
    default:
      return {};
  }
}

/** Números globais da plataforma, calculados na base de dados (sem dados comerciais de nenhuma conta). */
export async function adminOverview(actor: AuthUser) {
  assertAdmin(actor);
  const since = new Date(Date.now() - ACTIVE_WINDOW_MS);
  const [total, pending, approved, rejected, banned, active, recent, epayAccounts, e2Accounts] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: filterWhere("pending") }),
    prisma.user.count({ where: filterWhere("approved") }),
    prisma.user.count({ where: filterWhere("rejected") }),
    prisma.user.count({ where: filterWhere("banned") }),
    prisma.user.count({ where: { ...filterWhere("approved"), lastLoginAt: { gte: since } } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 8, select: { id: true, name: true, email: true, createdAt: true, status: true, role: true, bannedAt: true } }),
    prisma.integrationConfig.count({ where: { provider: "epay", enabled: true, secretConfig: { not: null } } }),
    prisma.integrationConfig.count({ where: { provider: "e2payments", enabled: true, verifiedAt: { not: null } } }),
  ]);
  return { total, pending, approved, rejected, banned, active, recent, integrations: { epayAccounts, e2Accounts } };
}

export async function listUsers(actor: AuthUser, p: { filter?: UserFilter; q?: string; page?: number }) {
  assertAdmin(actor);
  const pageSize = 25;
  const page = Math.max(1, p.page ?? 1);
  const where: Prisma.UserWhereInput = { ...filterWhere(p.filter ?? "all") };
  const q = p.q?.trim().slice(0, 100);
  if (q) where.OR = [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }];
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, name: true, email: true, createdAt: true, status: true, role: true, bannedAt: true, lastLoginAt: true },
    }),
    prisma.user.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / pageSize)) };
}

/** Detalhe administrativo: dados básicos, volume de atividade e estado das integrações (sem segredos). */
export async function getUserDetail(actor: AuthUser, id: string) {
  assertAdmin(actor);
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, status: true, bannedAt: true, banReason: true, approvedAt: true, rejectedAt: true, lastLoginAt: true, createdAt: true },
  });
  if (!user) throw new NotFoundError("Conta");
  const real = { ownerId: id, isDemo: false };
  const [products, checkouts, funnels, orders, paidOrders, integrations, history] = await Promise.all([
    prisma.product.count({ where: real }),
    prisma.checkout.count({ where: real }),
    prisma.funnel.count({ where: real }),
    prisma.order.count({ where: real }),
    prisma.order.count({ where: { ...real, status: "APPROVED", isTestPayment: false } }),
    integrationStatesForAdmin(id),
    prisma.adminAuditLog.findMany({ where: { targetUserId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, action: true, fromState: true, toState: true, reason: true, createdAt: true, actor: { select: { email: true } } } }),
  ]);
  return { user, state: accountState(user), counts: { products, checkouts, funnels, orders, paidOrders }, integrations, history };
}

/**
 * Aplica uma ação administrativa. Regras (policy.canApplyAdminAction): só o OWNER, nunca sobre a conta OWNER,
 * transições coerentes. A alteração é condicional ao estado lido (evita corridas) e fica registada.
 * - aprovar/rejeitar alteram apenas o estado de aprovação;
 * - banir/desbanir alteram apenas a suspensão (o estado de aprovação mantém-se) e banir termina todas as sessões;
 * - nenhum dado comercial, venda ou credencial é apagado.
 */
export async function applyAdminAction(actor: AuthUser, targetId: string, action: AdminAction, reason?: string) {
  assertAdmin(actor);
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, status: true, bannedAt: true, email: true } });
  if (!target) throw new NotFoundError("Conta");
  const check = canApplyAdminAction(actor, target, action);
  if (!check.ok) throw new DomainError(check.reason);
  const now = new Date();
  const from = accountState(target);
  const cleanReason = reason?.trim().slice(0, 300) || null;
  const data: Prisma.UserUpdateManyMutationInput =
    action === "approve"
      ? { status: "APPROVED" as AccountStatus, approvedAt: now }
      : action === "reject"
        ? { status: "REJECTED" as AccountStatus, rejectedAt: now }
        : action === "ban"
          ? { bannedAt: now, banReason: cleanReason }
          : { bannedAt: null, banReason: null };
  await prisma.$transaction(async (tx) => {
    const r = await tx.user.updateMany({ where: { id: target.id, role: "USER", status: target.status, bannedAt: target.bannedAt }, data });
    if (r.count !== 1) throw new DomainError("A conta foi alterada entretanto. Atualize a página.");
    if (action === "ban") await tx.session.deleteMany({ where: { userId: target.id } });
    const after = await tx.user.findUniqueOrThrow({ where: { id: target.id }, select: { status: true, bannedAt: true, role: true } });
    await tx.adminAuditLog.create({ data: { actorId: actor.id, targetUserId: target.id, action, fromState: from, toState: accountState(after), reason: cleanReason } });
  });
  return { email: target.email, action };
}
