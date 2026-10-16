"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireOwner } from "@/server/auth/session";
import { assertId } from "@/server/actions";
import { applyAdminAction } from "@/server/services/admin";
import { DomainError, NotFoundError } from "@/server/services/products";
import type { AdminAction } from "@/server/auth/policy";
import type { ActionResult } from "@/server/validation/common";

const MESSAGES: Record<AdminAction, string> = {
  approve: "Conta aprovada. O utilizador já pode entrar com o email e a password do registo.",
  reject: "Candidatura rejeitada. A conta não tem acesso à plataforma.",
  ban: "Conta suspensa. As sessões ativas foram terminadas.",
  unban: "Suspensão levantada. O acesso volta a depender do estado de aprovação.",
};

/**
 * Ações da Administração. A permissão é verificada AQUI no servidor (requireOwner: só a conta OWNER aprovada) e
 * outra vez no serviço; uma chamada direta por outra conta recebe 404/erro e nada é alterado.
 */
export async function adminUserAction(userId: string, action: AdminAction, reason?: string): Promise<ActionResult> {
  const actor = await requireOwner();
  if (!["approve", "reject", "ban", "unban"].includes(action)) return { ok: false, error: "Ação inválida." };
  try {
    await applyAdminAction(actor, assertId(userId), action, typeof reason === "string" ? reason : undefined);
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DomainError || e instanceof NotFoundError) return { ok: false, error: e.message };
    console.error("[admin]", e instanceof Error ? e.message : "erro");
    return { ok: false, error: "Ocorreu um erro inesperado. Tente novamente." };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: MESSAGES[action] };
}

/**
 * Link de redefinição de palavra-passe gerado pelo proprietário (quando o envio de email não está configurado).
 * O link é temporário (30 min), de uso único, fica registado no histórico administrativo e deve ser enviado
 * ao utilizador por um canal de confiança. Nunca é gerado para outra conta OWNER.
 */
export async function adminResetLinkAction(userId: string): Promise<ActionResult<{ link: string }>> {
  const actor = await requireOwner();
  const id = assertId(userId);
  const { prisma } = await import("@/server/db");
  const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true } });
  if (!target) return { ok: false, error: "Conta não encontrada." };
  if (target.role === "OWNER" && target.id !== actor.id) return { ok: false, error: "Ação não permitida." };
  const { createResetLinkForUser } = await import("@/server/auth/password-reset");
  const { resolveAppBaseUrl } = await import("@/server/app-url");
  const link = await createResetLinkForUser(id, await resolveAppBaseUrl());
  await prisma.adminAuditLog.create({ data: { actorId: actor.id, targetUserId: id, action: "password_reset_link", reason: "Link de redefinição de palavra-passe gerado" } });
  revalidatePath(`/admin/utilizadores/${id}`);
  return { ok: true, data: { link }, message: "Link gerado (válido 30 minutos, uso único). Envie-o ao utilizador por um canal de confiança." };
}

// ───── Partilha das credenciais de pagamento do administrador ─────
// Só a conta proprietária (requireOwner + verificação no serviço). Nenhuma ação devolve credenciais.

async function grantsAction(fn: () => Promise<string>): Promise<ActionResult> {
  try {
    const message = await fn();
    revalidatePath("/admin/integracoes");
    revalidatePath("/integracoes", "layout");
    return { ok: true, message };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof DomainError || e instanceof NotFoundError) return { ok: false, error: e.message };
    console.error("[admin] partilha de credenciais", e instanceof Error ? e.message : "erro");
    return { ok: false, error: "Ocorreu um erro inesperado. Tente novamente." };
  }
}

export async function grantCredentialsAction(userId: string, providers: string[]): Promise<ActionResult> {
  const actor = await requireOwner();
  const { grantCredentials, GATEWAY_NAMES } = await import("@/server/services/credential-grants");
  return grantsAction(async () => {
    const r = await grantCredentials(actor, assertId(userId), providers);
    const names = (ids: string[]) => ids.map((i) => GATEWAY_NAMES[i as keyof typeof GATEWAY_NAMES]).join(" e ");
    if (!r.created.length) return `O utilizador já tinha acesso a ${names(r.existing)}.`;
    return `Acesso concedido: ${names(r.created)}.${r.existing.length ? ` (${names(r.existing)} já estava ativo.)` : ""}`;
  });
}

export async function revokeGrantAction(grantId: string): Promise<ActionResult> {
  const actor = await requireOwner();
  const { revokeGrant } = await import("@/server/services/credential-grants");
  return grantsAction(async () => {
    await revokeGrant(actor, assertId(grantId));
    return "Acesso revogado. Novos pagamentos deste utilizador deixam de usar as suas credenciais.";
  });
}
