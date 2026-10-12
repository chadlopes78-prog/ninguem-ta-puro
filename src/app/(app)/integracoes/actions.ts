"use server";

import { revalidatePath } from "next/cache";
import { guarded } from "@/server/actions";
import { checkIntegration } from "@/server/services/integrations";
import { reconcilePendingPayments } from "@/server/services/payment-flow";

export async function checkIntegrationAction(provider: string) {
  return guarded(async () => {
    const r = await checkIntegration(provider);
    revalidatePath("/integracoes");
    return r.configured ? { ok: true, message: r.message } : { ok: false, error: `Não configurado: ${r.message}` };
  });
}

export async function reconcileAction() {
  return guarded(async () => {
    const r = await reconcilePendingPayments();
    revalidatePath("/pedidos");
    return { ok: true, message: `${r.checked} pagamento(s) pendente(s) verificado(s) na EPay; ${r.changed} atualizado(s).` };
  });
}
