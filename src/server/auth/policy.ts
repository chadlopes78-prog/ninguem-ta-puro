// Política central de acesso (funções puras, testáveis). Usada em todas as páginas, ações, APIs e tarefas.
//
// Estados de conta: PENDING_APPROVAL | APPROVED | REJECTED, mais a suspensão (bannedAt), que é independente
// da aprovação: desbanir devolve exatamente o estado de aprovação que a conta tinha.
// Papéis: OWNER (no máximo um, atribuído só no servidor) | USER.
import type { AccountStatus, UserRole } from "@prisma/client";

export type AccountState = "pending" | "approved" | "rejected" | "banned";

export interface PolicyUser {
  role: UserRole;
  status: AccountStatus;
  bannedAt: Date | null;
}

export function accountState(u: PolicyUser): AccountState {
  if (u.bannedAt) return "banned";
  if (u.status === "APPROVED") return "approved";
  if (u.status === "REJECTED") return "rejected";
  return "pending";
}

/** Acesso ao painel comercial (dashboard, produtos, pedidos, integrações…). */
export function canUseApp(u: PolicyUser): boolean {
  return accountState(u) === "approved";
}

/** Acesso à Administração da Plataforma. */
export function canAdminister(u: PolicyUser): boolean {
  return u.role === "OWNER" && canUseApp(u);
}

export type AdminAction = "approve" | "reject" | "ban" | "unban";

/**
 * Pode o administrador `actor` aplicar `action` à conta `target`?
 * - só o OWNER aprovado administra;
 * - ninguém altera a conta OWNER (nem a própria: impede auto-banimento acidental);
 * - as transições têm de fazer sentido no estado atual.
 */
export function canApplyAdminAction(actor: PolicyUser & { id: string }, target: PolicyUser & { id: string }, action: AdminAction): { ok: true } | { ok: false; reason: string } {
  if (!canAdminister(actor)) return { ok: false, reason: "Sem permissão." };
  if (target.role === "OWNER" || target.id === actor.id) return { ok: false, reason: "A conta do proprietário não pode ser alterada." };
  switch (action) {
    case "approve":
      return target.status === "APPROVED" ? { ok: false, reason: "A conta já está aprovada." } : { ok: true };
    case "reject":
      return target.status === "REJECTED" ? { ok: false, reason: "A conta já foi rejeitada." } : { ok: true };
    case "ban":
      return target.bannedAt ? { ok: false, reason: "A conta já está suspensa." } : { ok: true };
    case "unban":
      return target.bannedAt ? { ok: true } : { ok: false, reason: "A conta não está suspensa." };
  }
}

export const STATE_LABELS: Record<AccountState, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  banned: "Suspensa",
};
