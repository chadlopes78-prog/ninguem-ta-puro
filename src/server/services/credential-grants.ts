// Partilha das credenciais de pagamento do administrador (conta proprietária) com utilizadores autorizados.
//
// Regras:
//  - só a conta proprietária aprovada (canAdminister) concede ou revoga, sempre para UM utilizador e UM gateway;
//  - as credenciais nunca saem do servidor: estas funções só devolvem estados, nomes e datas;
//  - a autorização é verificada no servidor em cada novo pagamento (registry.getActivePaymentProviders);
//  - revogar impede NOVOS pagamentos; os já iniciados continuam a ser confirmados (Payment.credentialOwnerId);
//  - o utilizador só pode pedir a remoção (o administrador é notificado e decide).
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { canAdminister, type PolicyUser } from "@/server/auth/policy";
import { acceptsNewPayments, gatewayContext, providerFor } from "@/server/payments/gateways";
import { PROVIDER_CATALOG, type GatewayId } from "@/server/payments/types";
import { notifyUsers } from "@/server/notifications/events";
import { DomainError, NotFoundError } from "./products";

const GATEWAY_IDS = PROVIDER_CATALOG.map((p) => p.id) as GatewayId[];
export const GATEWAY_NAMES: Record<GatewayId, string> = { epay: "EPay", e2payments: "E2Payments" };

function assertAdmin(actor: PolicyUser & { id: string }) {
  // mesma resposta que um recurso inexistente: não revela a funcionalidade a outras contas
  if (!canAdminister(actor)) throw new NotFoundError("Página");
}

async function log(ownerId: string, provider: string, message: string) {
  await prisma.integrationLog.create({ data: { ownerId, provider, level: "info", message: message.slice(0, 500) } });
}

/** Estado dos gateways DO ADMINISTRADOR (apenas se aceitam pagamentos; nunca credenciais). */
export async function adminGatewayAvailability(adminId: string): Promise<Record<GatewayId, boolean>> {
  const ctx = await gatewayContext(adminId);
  return Object.fromEntries(GATEWAY_IDS.map((id) => [id, acceptsNewPayments(id, providerFor(id, ctx), ctx)])) as Record<GatewayId, boolean>;
}

/** Utilizadores que podem receber acesso (aprovados, não suspensos, não o próprio administrador). */
export async function searchGrantableUsers(actor: PolicyUser & { id: string }, q: string) {
  assertAdmin(actor);
  const term = q.trim().slice(0, 100);
  return prisma.user.findMany({
    where: {
      id: { not: actor.id },
      role: "USER",
      status: "APPROVED",
      bannedAt: null,
      ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term, mode: "insensitive" } }, { id: term }] } : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, email: true },
  });
}

export async function getGrantableUser(actor: PolicyUser & { id: string }, userId: string) {
  assertAdmin(actor);
  return prisma.user.findFirst({ where: { id: userId, role: "USER", status: "APPROVED", bannedAt: null, NOT: { id: actor.id } }, select: { id: true, name: true, email: true } });
}

/** Concede ao utilizador o uso das credenciais do administrador nos gateways indicados (um registo por gateway). */
export async function grantCredentials(actor: PolicyUser & { id: string }, granteeId: string, providers: unknown): Promise<{ created: GatewayId[]; existing: GatewayId[] }> {
  assertAdmin(actor);
  const wanted = Array.isArray(providers) ? GATEWAY_IDS.filter((id) => providers.includes(id)) : [];
  if (!wanted.length) throw new DomainError("Escolha pelo menos um método de pagamento (EPay ou E2Payments).");
  const grantee = await getGrantableUser(actor, granteeId);
  if (!grantee) throw new DomainError("Utilizador inválido: só contas aprovadas e não suspensas podem receber acesso.");
  const created: GatewayId[] = [];
  const existing: GatewayId[] = [];
  for (const provider of wanted) {
    const active = await prisma.paymentCredentialGrant.findFirst({ where: { granteeId: grantee.id, provider, status: "ACTIVE" }, select: { id: true } });
    if (active) {
      existing.push(provider);
      continue;
    }
    try {
      await prisma.paymentCredentialGrant.create({ data: { grantorId: actor.id, granteeId: grantee.id, provider } });
      created.push(provider);
      await log(actor.id, provider, `Acesso às credenciais ${GATEWAY_NAMES[provider]} concedido a ${grantee.email}.`);
    } catch (e) {
      // pedido concorrente já criou a autorização ativa (índice único parcial)
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") existing.push(provider);
      else throw e;
    }
  }
  if (created.length) {
    await notifyUsers(
      prisma,
      {
        type: "ACCOUNT_ALERT",
        eventKey: `grant:${grantee.id}:${created.join("+")}:${Date.now()}`,
        title: "Novo método de pagamento disponível",
        body: `O administrador disponibilizou ${created.map((p) => GATEWAY_NAMES[p]).join(" e ")} para os seus produtos. Veja em Integrações.`,
        url: "/integracoes",
      },
      { userIds: [grantee.id] },
    );
  }
  return { created, existing };
}

/** Revoga uma autorização individual. Pagamentos já iniciados continuam a ser confirmados normalmente. */
export async function revokeGrant(actor: PolicyUser & { id: string }, grantId: string): Promise<void> {
  assertAdmin(actor);
  const grant = await prisma.paymentCredentialGrant.findFirst({ where: { id: grantId, grantorId: actor.id }, include: { grantee: { select: { email: true } } } });
  if (!grant) throw new NotFoundError("Autorização");
  if (grant.status === "REVOKED") return;
  await prisma.paymentCredentialGrant.update({ where: { id: grant.id }, data: { status: "REVOKED", revokedAt: new Date() } });
  await log(actor.id, grant.provider, `Acesso às credenciais ${GATEWAY_NAMES[grant.provider as GatewayId] ?? grant.provider} revogado a ${grant.grantee.email}.`);
  await notifyUsers(
    prisma,
    {
      type: "ACCOUNT_ALERT",
      eventKey: `grant-revoked:${grant.id}`,
      title: "Método de pagamento removido",
      body: `O administrador removeu o acesso a ${GATEWAY_NAMES[grant.provider as GatewayId] ?? grant.provider}. Pagamentos já iniciados continuam a ser confirmados.`,
      url: "/integracoes",
    },
    { userIds: [grant.granteeId] },
  );
}

/** Autorizações concedidas por este administrador (ativas primeiro, depois as revogadas). */
export async function listGrantsForAdmin(actor: PolicyUser & { id: string }) {
  assertAdmin(actor);
  const rows = await prisma.paymentCredentialGrant.findMany({
    where: { grantorId: actor.id },
    orderBy: [{ status: "asc" }, { removalRequestedAt: { sort: "desc", nulls: "last" } }, { grantedAt: "desc" }],
    take: 200,
    select: { id: true, provider: true, status: true, grantedAt: true, revokedAt: true, removalRequestedAt: true, grantee: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((r) => ({ ...r, providerName: GATEWAY_NAMES[r.provider as GatewayId] ?? r.provider }));
}

/**
 * Integrações disponibilizadas ao utilizador `userId` (só as autorizações ATIVAS dele). Devolve apenas o necessário
 * para mostrar o estado: nenhuma credencial, chave, token ou identificador do administrador.
 */
export async function listSharedForUser(userId: string) {
  const grants = await prisma.paymentCredentialGrant.findMany({
    where: { granteeId: userId, status: "ACTIVE", grantor: { role: "OWNER" } },
    orderBy: { grantedAt: "asc" },
    select: { id: true, provider: true, grantedAt: true, removalRequestedAt: true, grantorId: true, grantor: { select: { status: true, bannedAt: true } } },
  });
  const availability = new Map<string, Record<GatewayId, boolean>>();
  const out = [];
  for (const g of grants) {
    if (!GATEWAY_IDS.includes(g.provider as GatewayId)) continue;
    if (!availability.has(g.grantorId)) availability.set(g.grantorId, await adminGatewayAvailability(g.grantorId));
    const grantorOk = g.grantor.status === "APPROVED" && !g.grantor.bannedAt;
    out.push({
      id: g.id,
      provider: g.provider as GatewayId,
      name: GATEWAY_NAMES[g.provider as GatewayId],
      grantedAt: g.grantedAt,
      removalRequestedAt: g.removalRequestedAt,
      available: grantorOk && availability.get(g.grantorId)![g.provider as GatewayId],
    });
  }
  return out;
}

/** O utilizador autorizado pede a remoção do acesso: regista e avisa o administrador (não revoga sozinho). */
export async function requestGrantRemoval(userId: string, grantId: string): Promise<void> {
  const grant = await prisma.paymentCredentialGrant.findFirst({ where: { id: grantId, granteeId: userId, status: "ACTIVE" }, include: { grantee: { select: { name: true, email: true } } } });
  if (!grant) throw new NotFoundError("Integração");
  if (grant.removalRequestedAt) return;
  await prisma.paymentCredentialGrant.update({ where: { id: grant.id }, data: { removalRequestedAt: new Date() } });
  const name = GATEWAY_NAMES[grant.provider as GatewayId] ?? grant.provider;
  await notifyUsers(
    prisma,
    {
      type: "ACCOUNT_ALERT",
      eventKey: `grant-removal:${grant.id}`,
      title: "Pedido de remoção de acesso",
      body: `${grant.grantee.name} (${grant.grantee.email}) pediu a remoção do acesso a ${name}.`,
      url: "/admin/integracoes",
    },
    { userIds: [grant.grantorId] },
  );
}

export async function pendingRemovalRequests(actor: PolicyUser & { id: string }): Promise<number> {
  if (!canAdminister(actor)) return 0;
  return prisma.paymentCredentialGrant.count({ where: { grantorId: actor.id, status: "ACTIVE", removalRequestedAt: { not: null } } });
}
