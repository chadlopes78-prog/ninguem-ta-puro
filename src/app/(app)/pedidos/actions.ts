"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { assertId, formToObject, guarded, parseForm } from "@/server/actions";
import { manualOrderSchema } from "@/server/validation/schemas";
import { changeOrderStatus, createManualOrder, ORDER_STATUSES } from "@/server/services/orders";
import { z } from "zod";

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
