"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { assertId, formToObject, guarded, parseForm } from "@/server/actions";
import { manualOrderSchema } from "@/server/validation/schemas";
import { changeOrderStatus, createManualOrder, ORDER_STATUSES } from "@/server/services/orders";
import { z } from "zod";
import { resolveUncertainPayment } from "@/server/services/payment-flow";
import { recordRefund } from "@/server/services/finance";
import { parseMoneyToCents } from "@/lib/money";
import { deleteOrder } from "@/server/services/sales-history";

/** Pagamento "por verificar" (ex.: E2Payments sem resposta): o dono confirma depois de verificar no painel do fornecedor. */
export async function resolveUncertainPaymentAction(id: string, outcome: "paid" | "failed") {
  return guarded(async ({ isDemo, scope, user }) => {
    if (isDemo || (outcome !== "paid" && outcome !== "failed")) return { ok: false, error: "Operação inválida." };
    const r = await resolveUncertainPayment(assertId(id), outcome, user.email, scope.ownerId);
    if (!r.ok) return r;
    revalidatePath("/pedidos");
    return { ok: true, message: outcome === "paid" ? "Pagamento confirmado. O acesso ao produto foi libertado." : "Pagamento marcado como não concluído." };
  });
}

/** Reembolso parcial ou total de um pedido pago (real: registo de um reembolso feito no painel do gateway). */
export async function recordRefundAction(id: string, input: { amount: string; reason: string; confirmedAtGateway: boolean }) {
  return guarded(async ({ scope, user }) => {
    const cents = parseMoneyToCents(String(input?.amount ?? ""));
    if (cents === null || cents <= 0) return { ok: false, error: "Indique um valor de reembolso válido." };
    const r = await recordRefund({ orderId: assertId(id), amountCents: cents, reason: typeof input.reason === "string" ? input.reason : undefined, confirmedAtGateway: input.confirmedAtGateway === true }, scope, `admin:${user.email}`);
    revalidatePath("/pedidos");
    revalidatePath("/relatorios");
    return { ok: true, message: r.full ? "Reembolso total registado. O pedido passou a reembolsado." : "Reembolso parcial registado." };
  });
}

export async function changeOrderStatusAction(id: string, to: OrderStatus) {
  return guarded(async ({ scope, user }) => {
    if (!ORDER_STATUSES.includes(to)) return { ok: false, error: "Estado inválido." };
    await changeOrderStatus(assertId(id), to, scope, `admin:${user.email}`);
    revalidatePath("/pedidos");
    return { ok: true, message: "Estado do pedido atualizado." };
  });
}

export async function createManualOrderAction(fd: FormData) {
  return guarded<{ id: string }>(async ({ isDemo, scope }) => {
    const schema = isDemo ? manualOrderSchema.extend({ status: z.enum(["PENDING", "APPROVED", "DECLINED", "CANCELED"]) }) : manualOrderSchema;
    const p = parseForm(schema, formToObject(fd));
    if (!p.ok) return p.result;
    const o = await createManualOrder(p.data, scope);
    revalidatePath("/pedidos");
    return { ok: true, data: { id: o.id }, message: isDemo ? "Pedido de demonstração criado." : "Pedido manual de teste criado (não conta como venda)." };
  });
}

/** Elimina permanentemente um pedido real desta conta (ex.: compra de teste feita pelo próprio vendedor). */
export async function deleteOrderAction(id: string) {
  return guarded(async ({ scope }) => {
    if (scope.isDemo) return { ok: false, error: "Os pedidos de demonstração removem-se em Configurações → Modo de demonstração." };
    const n = await deleteOrder(scope.ownerId, assertId(id));
    revalidatePath("/", "layout");
    return { ok: true, message: n > 1 ? `Pedido eliminado (com ${n - 1} upsell/downsell associado${n > 2 ? "s" : ""}).` : "Pedido eliminado do histórico." };
  });
}
