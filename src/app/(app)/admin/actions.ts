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
