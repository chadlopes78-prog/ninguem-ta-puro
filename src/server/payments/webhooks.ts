import { createHmac, timingSafeEqual } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { applyPaymentStatus } from "./confirm";
import type { PaymentProvider } from "./types";

/** Utilitário para fornecedores que assinam com HMAC-SHA256 em hexadecimal (comparação em tempo constante). */
export function verifyHmacSha256(rawBody: string, signatureHex: string | null, secret: string | undefined): boolean {
  if (!secret || !signatureHex || !/^[0-9a-f]{64}$/i.test(signatureHex)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signatureHex, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type WebhookOutcome = { status: number; body: unknown; result: string };

/**
 * Processamento de notificações: assinatura → registo idempotente → validação e aplicação → resposta esperada.
 * - assinatura inválida: 401, nada é alterado;
 * - evento repetido já tratado: confirmado sem efeitos;
 * - evento registado mas não concluído (ex.: falha a meio): é reprocessado com segurança;
 * - erro interno: 500 para o fornecedor voltar a tentar.
 */
export async function handleWebhook(provider: PaymentProvider, rawBody: string, headers: Headers, opts: { ownerId?: string } = {}): Promise<WebhookOutcome> {
  const ownerId = opts.ownerId ?? null;
  if (!provider.verifySignature(rawBody, headers)) {
    await prisma.integrationLog.create({ data: { ownerId, provider: provider.id, level: "warn", message: "Notificação com assinatura inválida rejeitada" } });
    return { status: 401, body: { error: "invalid signature" }, result: "invalid_signature" };
  }

  let event;
  try {
    event = provider.parseEvent(rawBody, headers);
  } catch {
    await prisma.integrationLog.create({ data: { ownerId, provider: provider.id, level: "warn", message: "Notificação com formato inválido" } });
    return { status: 400, body: { error: "invalid payload" }, result: "invalid_payload" };
  }

  let payload: Prisma.InputJsonValue;
  try {
    payload = JSON.parse(rawBody) as Prisma.InputJsonValue;
  } catch {
    payload = { raw: rawBody.slice(0, 10_000) };
  }

  let stored = await prisma.paymentEvent.findUnique({ where: { provider_externalEventId: { provider: provider.id, externalEventId: event.eventId } } });
  if (stored && ["PROCESSED", "IGNORED", "REJECTED"].includes(stored.status)) {
    return { ...provider.webhookAck(), result: "duplicate" };
  }
  if (!stored) {
    try {
      stored = await prisma.paymentEvent.create({
        data: { provider: provider.id, externalEventId: event.eventId, type: event.state, signatureValid: true, payload, ownerId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ...provider.webhookAck(), result: "duplicate" };
      throw e;
    }
  }

  try {
    const r = await applyPaymentStatus(provider.id, event, "webhook", { ownerId: opts.ownerId });
    const status = r.result === "rejected" ? "REJECTED" : r.result === "ignored" ? "IGNORED" : "PROCESSED";
    await prisma.paymentEvent.update({ where: { id: stored.id }, data: { status, error: r.reason ?? null, orderId: r.orderId ?? null, processedAt: new Date() } });
    return { ...provider.webhookAck(), result: r.result };
  } catch (e) {
    await prisma.paymentEvent.update({ where: { id: stored.id }, data: { status: "FAILED", error: "Erro interno ao processar" } }).catch(() => undefined);
    throw e;
  }
}

/**
 * Encaminhamento de um aviso de pagamento para a conta certa:
 * 1. identifica, SEM confiar nos dados, o pagamento referido pelo aviso;
 * 2. carrega as credenciais da conta dona dessa encomenda;
 * 3. só depois verifica a assinatura com essa chave (HMAC) e aplica o estado.
 * Um aviso assinado com a chave de outra conta falha a verificação; um pagamento desconhecido não é processado.
 */
export async function handleProviderWebhook(providerId: string, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const { testLocalProvider, testProviderAllowed } = await import("./providers/test-local");
  const { getProvider } = await import("./registry");
  if (providerId === testLocalProvider.id) {
    if (!testProviderAllowed() || !testLocalProvider.isConfigured()) return { status: 404, body: { error: "provider not configured" }, result: "not_configured" };
    return handleWebhook(testLocalProvider, rawBody, headers);
  }
  if (providerId !== "epay") return { status: 404, body: { error: "provider not configured" }, result: "not_configured" };
  const { epayUnverifiedPaymentId } = await import("./providers/epay");
  const externalId = epayUnverifiedPaymentId(rawBody);
  const payment = externalId
    ? await prisma.payment.findUnique({ where: { provider_externalId: { provider: "epay", externalId } }, select: { credentialOwnerId: true, order: { select: { ownerId: true } } } })
    : null;
  if (!payment) {
    await prisma.integrationLog.create({ data: { provider: "epay", level: "warn", message: "Aviso de pagamento para uma transação desconhecida: ignorado (não verificável)." } });
    return { status: 404, body: { error: "unknown payment" }, result: "unknown_payment" };
  }
  const ownerId = payment.order.ownerId;
  // Chave da conta cujas credenciais iniciaram o pagamento (partilha do administrador) ou, como até agora, da
  // conta dona da encomenda. A verificação HMAC e a aplicação do estado não mudam; a encomenda continua da sua conta.
  const provider = await getProvider("epay", payment.credentialOwnerId ?? ownerId);
  if (!provider || !provider.isConfigured()) return { status: 404, body: { error: "provider not configured" }, result: "not_configured" };
  return handleWebhook(provider, rawBody, headers, { ownerId });
}
