// Webhooks da Pagar API (guia: docs/pagar-api.md, secção 06).
//
//   1. Pagar-Event-Id obrigatório (400); assinatura Pagar-Signature validada com o webhook secret da conta (401).
//      A conta é encontrada SEM confiar no corpo: tenta-se o webhook secret de cada conta com a Pagar configurada.
//   2. O evento é registado uma única vez (PaymentEvent único por fornecedor + Pagar-Event-Id): repetições não
//      entregam o produto duas vezes.
//   3. O estado NUNCA vem do corpo do evento (o guia não descreve o seu formato): identifica-se o pagamento e
//      consulta-se a Pagar com a API key dessa conta (GET /payments/:id ou /payments/by-reference/:reference).
//      Só PAID dessa consulta aprova a encomenda, através da confirmação existente (applyPaymentStatus).
//   4. Eventos sem pagamento (carteira, payouts, webhook.test) são aceites e ignorados.
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { applyPaymentStatus } from "./confirm";
import { gatewayContext, pagarCredentialSets, buildPagarProvider } from "./gateways";
import { pagarEnvCredentials, pagarEventFailure, pagarEventPaymentRef, verifyPagarWebhook, type PagarMode } from "./providers/pagar";
import type { WebhookOutcome } from "./webhooks";

const ACK = { received: true };

async function warn(ownerId: string | null, message: string) {
  await prisma.integrationLog.create({ data: { ownerId, provider: "pagar", level: "warn", message: message.slice(0, 500) } });
}

/** Contas com credenciais da Pagar: a proprietária (variáveis PAGAR_*) e as que as guardaram no painel. */
async function candidateAccounts(): Promise<string[]> {
  const [owner, rows] = await Promise.all([
    pagarEnvCredentials() ? prisma.user.findFirst({ where: { role: "OWNER" }, select: { id: true } }) : Promise.resolve(null),
    prisma.integrationConfig.findMany({ where: { provider: "pagar", secretConfig: { not: null } }, select: { ownerId: true } }),
  ]);
  return [...new Set([...(owner ? [owner.id] : []), ...rows.map((r) => r.ownerId)])];
}

export async function handlePagarWebhook(rawBody: string, headers: Headers, nowMs = Date.now()): Promise<WebhookOutcome> {
  if (!headers.get("pagar-event-id")) return { status: 400, body: { error: "missing event id" }, result: "invalid_payload" };

  // 1. assinatura — com o webhook secret de cada conta configurada, até uma validar
  // (cada conta pode ter credenciais de teste e de produção: vale o webhook secret de qualquer um dos modos)
  let accountId: string | null = null;
  let mode: PagarMode = "test";
  let eventId = "";
  search: for (const id of await candidateAccounts()) {
    const sets = pagarCredentialSets(await gatewayContext(id));
    for (const m of ["live", "test"] as const) {
      const creds = sets[m];
      if (!creds) continue;
      const v = verifyPagarWebhook(rawBody, headers, creds.webhookSecret, nowMs);
      if (v.ok) {
        accountId = id;
        mode = m;
        eventId = v.eventId;
        break search;
      }
    }
  }
  if (!accountId) {
    await warn(null, "Webhook da Pagar com assinatura inválida ou fora do prazo: rejeitado.");
    return { status: 401, body: { error: "invalid signature" }, result: "invalid_signature" };
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { error: "invalid payload" }, result: "invalid_payload" };
  }

  // 2. registo único do evento
  let stored = await prisma.paymentEvent.findUnique({ where: { provider_externalEventId: { provider: "pagar", externalEventId: eventId } } });
  if (stored && ["PROCESSED", "IGNORED", "REJECTED"].includes(stored.status)) return { status: 200, body: ACK, result: "duplicate" };
  if (!stored) {
    try {
      stored = await prisma.paymentEvent.create({
        data: { provider: "pagar", externalEventId: eventId, type: "pagar.webhook", signatureValid: true, payload: event as Prisma.InputJsonValue, ownerId: accountId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { status: 200, body: ACK, result: "duplicate" };
      throw e;
    }
  }
  const finish = (status: "PROCESSED" | "IGNORED" | "REJECTED" | "FAILED", error: string | null, orderId: string | null = null) =>
    prisma.paymentEvent.update({ where: { id: stored!.id }, data: { status, error, orderId, processedAt: status === "FAILED" ? null : new Date() } });

  // 3. pagamento referido pelo evento (eventos de carteira/payout/teste não têm pagamento)
  const ref = pagarEventPaymentRef(event);
  if (!ref) {
    await finish("IGNORED", "Evento sem pagamento");
    return { status: 200, body: ACK, result: "ignored" };
  }
  const payment =
    (ref.id ? await prisma.payment.findUnique({ where: { provider_externalId: { provider: "pagar", externalId: ref.id } }, include: { order: { select: { id: true, ownerId: true } } } }) : null) ??
    (ref.reference ? await prisma.payment.findFirst({ where: { provider: "pagar", idempotencyKey: ref.reference }, include: { order: { select: { id: true, ownerId: true } } } }) : null);
  if (!payment) {
    await finish("IGNORED", "Pagamento desconhecido");
    await warn(accountId, "Webhook da Pagar para um pagamento desconhecido: ignorado.");
    return { status: 200, body: ACK, result: "unknown_payment" };
  }
  // as credenciais que validaram o aviso têm de ser as que iniciaram este pagamento
  if ((payment.credentialOwnerId ?? payment.order.ownerId) !== accountId) {
    await finish("REJECTED", "Pagamento de outra conta", payment.orderId);
    await warn(accountId, "Webhook da Pagar validado com as credenciais de outra conta: ignorado.");
    return { status: 200, body: ACK, result: "rejected" };
  }

  // 4. fonte de verdade: consulta autenticada com a API key da conta
  try {
    // consulta com a API key do mesmo modo (teste/produção) cujo webhook secret validou o aviso
    const provider = buildPagarProvider(await gatewayContext(accountId), mode);
    const status = await provider.getStatus!(payment.externalId ?? ref.id, payment.idempotencyKey);
    if (status.state === "pending") {
      await finish("PROCESSED", `Ainda ${status.rawStatus}`, payment.orderId);
      return { status: 200, body: ACK, result: "pending" };
    }
    // motivo: o da consulta, completado com o que o aviso assinado trouxer (códigos/mensagens do operador)
    if (status.state === "failed" || status.state === "canceled") {
      const extra = pagarEventFailure(event);
      if (extra?.text && !(status.failureMessage ?? "").includes(extra.text)) {
        status.failureMessage = [status.failureMessage, extra.text].filter(Boolean).join(" — ").slice(0, 300);
      }
      status.failureCode ??= extra?.code ?? null;
      status.buyerMessage ??= extra?.safeMessage ?? null;
    }
    const r = await applyPaymentStatus("pagar", status, "webhook", { ownerId: payment.order.ownerId });
    await finish(r.result === "rejected" ? "REJECTED" : r.result === "ignored" ? "IGNORED" : "PROCESSED", r.reason ?? null, r.orderId ?? payment.orderId);
    return { status: 200, body: ACK, result: r.result };
  } catch (e) {
    // sem confirmação da Pagar agora: a Pagar volta a enviar o aviso (e a consulta periódica continua)
    await finish("FAILED", "Consulta à Pagar falhou").catch(() => undefined);
    await warn(accountId, `Webhook da Pagar: consulta do pagamento falhou (${e instanceof Error ? e.message.slice(0, 120) : "erro"}).`);
    return { status: 500, body: { error: "processing error" }, result: "error" };
  }
}
