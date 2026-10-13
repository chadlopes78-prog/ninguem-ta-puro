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

/** Pagamento "por verificar" (ex.: E2Payments sem resposta): o dono confirma depois de verificar no painel do fornecedor. */
export async function resolveUncertainPaymentAction(id: string, outcome: "paid" | "failed") {
  return guarded(async ({ isDemo, user }) => {
    if (isDemo || (outcome !== "paid" && outcome !== "failed")) return { ok: false, error: "Operação inválida." };
    const r = await resolveUncertainPayment(assertId(id), outcome, user.email);
    if (!r.ok) return r;
    revalidatePath("/pedidos");
    return { ok: true, message: outcome === "paid" ? "Pagamento confirmado. O acesso ao produto foi libertado." : "Pagamento marcado como não concluído." };
  });
}

/** Reembolso parcial ou total de um pedido pago (real: registo de um reembolso feito no painel do gateway). */
export async function recordRefundAction(id: string, input: { amount: string; reason: string; confirmedAtGateway: boolean }) {
  return guarded(async ({ isDemo, user }) => {
    const cents = parseMoneyToCents(String(input?.amount ?? ""));
    if (cents === null || cents <= 0) return { ok: false, error: "Indique um valor de reembolso válido." };
    const r = await recordRefund({ orderId: assertId(id), amountCents: cents, reason: typeof input.reason === "string" ? input.reason : undefined, confirmedAtGateway: input.confirmedAtGateway === true }, isDemo, `admin:${user.email}`);
    revalidatePath("/pedidos");
    revalidatePath("/relatorios");
    return { ok: true, message: r.full ? "Reembolso total registado. O pedido passou a reembolsado." : "Reembolso parcial registado." };
  });
}

export async function changeOrderStatusAction(id: string, to: OrderStatus) {
  return guarded(async ({ isDemo, user }) => {
    if (!ORDER_STATUSES.includes(to)) return { ok: false, error: "Estado inválido." };
    await changeOrderStatus(assertId(id), to, isDemo, `admin:${user.email}`);
    revalidatePath("/pedidos");
    return { ok: true, message: "Estado do pedido atualizado." };
  });
}

export async function createManualOrderAction(fd: FormData) {
  return guarded<{ id: string }>(async ({ isDemo }) => {
    const schema = isDemo ? manualOrderSchema.extend({ status: z.enum(["PENDING", "APPROVED", "DECLINED", "CANCELED"]) }) : manualOrderSchema;
    const p = parseForm(schema, formToObject(fd));
    if (!p.ok) return p.result;
    const o = await createManualOrder(p.data, isDemo);
    revalidatePath("/pedidos");
    return { ok: true, data: { id: o.id }, message: isDemo ? "Pedido de demonstração criado." : "Pedido manual de teste criado (não conta como venda)." };
  });
}
