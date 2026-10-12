import { createHmac, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import type { NormalizedPaymentEvent, PaymentProvider } from "./types";

/** Utilitário para fornecedores que assinam com HMAC-SHA256 em hexadecimal. */
export function verifyHmacSha256(rawBody: string, signatureHex: string | null, secret: string | undefined): boolean {
  if (!secret || !signatureHex || !/^[0-9a-f]{64}$/i.test(signatureHex)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signatureHex, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type WebhookOutcome =
  | { status: 401; body: { error: string } }
  | { status: 200; body: { received: true; duplicate?: boolean; result: string } };

/**
 * Processamento de webhooks: assinatura → idempotência → validação do estado → aplicação → registo.
 * Só um evento verificado pode aprovar um pedido real.
 */
export async function handleWebhook(provider: PaymentProvider, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  if (!provider.verifySignature(rawBody, headers)) {
    await prisma.integrationLog.create({ data: { provider: provider.id, level: "warn", message: "Webhook com assinatura inválida rejeitado" } });
    return { status: 401, body: { error: "invalid signature" } };
  }
  const event = provider.parseEvent(rawBody);
  let stored;
  try {
    stored = await prisma.paymentEvent.create({
      data: {
        provider: provider.id,
        externalEventId: event.externalEventId,
        type: event.type,
        signatureValid: true,
        payload: JSON.parse(rawBody) as Prisma.InputJsonValue,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: 200, body: { received: true, duplicate: true, result: "duplicate" } };
    }
    throw e;
  }
  const result = await applyPaymentEvent(stored.id, event);
  return { status: 200, body: { received: true, result } };
}

const TRANSITIONS: Record<string, { from: string[]; to: "APPROVED" | "DECLINED" | "REFUNDED" | "CANCELED" }> = {
  "payment.approved": { from: ["PENDING"], to: "APPROVED" },
  "payment.declined": { from: ["PENDING"], to: "DECLINED" },
  "payment.refunded": { from: ["APPROVED"], to: "REFUNDED" },
  "payment.canceled": { from: ["PENDING"], to: "CANCELED" },
};

export async function applyPaymentEvent(eventId: string, event: NormalizedPaymentEvent): Promise<string> {
  const rule = TRANSITIONS[event.type];
  const finish = (status: "PROCESSED" | "IGNORED" | "REJECTED", error?: string, orderId?: string) =>
    prisma.paymentEvent.update({ where: { id: eventId }, data: { status, error, orderId, processedAt: new Date() } }).then(() => status.toLowerCase());

  if (!rule) return finish("IGNORED", "Tipo de evento não tratado");
  const order = event.orderCode ? await prisma.order.findUnique({ where: { code: event.orderCode } }) : null;
  if (!order || order.isDemo) return finish("REJECTED", "Pedido inexistente");
  if (event.amountCents !== null && (event.amountCents !== order.totalCents || event.currency !== order.currency)) {
    return finish("REJECTED", "Valor ou moeda não coincidem com o pedido", order.id);
  }
  if (!rule.from.includes(order.status)) return finish("IGNORED", `Estado atual ${order.status} incompatível`, order.id);
  const now = new Date();
  const fee = event.feeCents ?? order.feeCents;
  const res = await prisma.order.updateMany({
    where: { id: order.id, status: order.status },
    data: {
      status: rule.to,
      externalRef: event.externalRef ?? order.externalRef,
      feeCents: fee,
      netCents: order.totalCents - fee,
      ...(rule.to === "APPROVED" ? { approvedAt: now } : {}),
      ...(rule.to === "REFUNDED" ? { refundedAt: now } : {}),
      ...(rule.to === "CANCELED" ? { canceledAt: now } : {}),
    },
  });
  if (res.count !== 1) return finish("IGNORED", "Pedido alterado concorrentemente", order.id);
  return finish("PROCESSED", undefined, order.id);
}
