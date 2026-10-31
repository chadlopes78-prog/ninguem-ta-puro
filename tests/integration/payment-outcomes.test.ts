// Resultado real de cada pagamento (sessão 28): cancelado pelo cliente, saldo insuficiente, aprovado, pendente,
// avisos repetidos e confirmação tardia. Pagamentos apenas pelo fornecedor de TESTE local (notificação assinada)
// — os motivos enviados imitam os textos que os gateways devolvem; nada contacta gateways reais.
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct } from "@/server/services/products";
import { submitCheckout } from "@/server/services/purchase";
import { getPaymentView, reconcileStalePayments } from "@/server/services/payment-flow";
import { listOrders } from "@/server/services/orders";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { classifyOutcome, matchFailure } from "@/server/payments/outcome";
import { scopeOf, type Scope } from "@/server/scope";

const SECRET = "segredo-apenas-para-testes";
beforeAll(() => {
  process.env.NTP_ENABLE_TEST_PROVIDER = "true";
  process.env.TEST_PROVIDER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
});

let S: Scope;
let slug: string;
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
  const p = await createProduct(productSchema.parse({ name: "Curso", description: "Descrição do produto de teste.", type: "COURSE", priceCents: "250,00", currency: "MZN", status: "DRAFT", deliveryUrl: "https://area.exemplo.co.mz/membros" }), S);
  await publishProduct(p.id, S);
  slug = p.primaryCheckout.slug!;
});

let seq = 0;
async function buy(phone = "841234567") {
  const r = await submitCheckout(slug, { name: "Ana", email: `ana${seq}@exemplo.co.mz`, phone, method: "mpesa", idempotencyKey: `idem${Date.now()}${seq++}abcdefgh` });
  if (r.kind !== "payment_started") throw new Error(r.kind);
  const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token }, include: { payments: true } });
  return { token: r.token, order, payment: order.payments[0] };
}
async function notify(p: { id: string; externalId: string | null; idempotencyKey: string; amountCents: number }, status: string, message?: string, eventId = `ev_${p.id}_${status}`) {
  const raw = JSON.stringify({ eventId, externalId: p.externalId, reference: p.idempotencyKey, status, amountCents: status === "paid" ? p.amountCents : null, currency: "MZN", feeCents: 0, ...(message ? { message } : {}) });
  return handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
}
const state = async (orderId: string) => {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { payments: true, delivery: true } });
  return { order: o.status, payment: o.payments[0].status, code: o.payments[0].failureCode, reason: o.payments[0].failureReason, gateway: o.payments[0].gatewayMessage, delivery: o.delivery };
};
const row = async (orderId: string) => (await listOrders({ scope: S })).rows.find((r) => r.id === orderId)!;

describe("resultado real de cada pagamento", () => {
  it("TESTE 1: o cliente cancela no telemóvel → CANCELADO, «Cancelado pelo cliente» (guardado e visível em Operações)", async () => {
    const { order, payment, token } = await buy();
    expect((await notify(payment, "failed", "Request cancelled by customer")).status).toBe(200);
    expect(await state(order.id)).toMatchObject({ order: "CANCELED", payment: "CANCELED", code: "CUSTOMER_CANCELLED", reason: "Cancelado pelo cliente", gateway: "Request cancelled by customer", delivery: null });
    // persiste e aparece na lista de Operações
    expect((await row(order.id)).payments[0]).toEqual({ failureCode: "CUSTOMER_CANCELLED", failureReason: "Cancelado pelo cliente" });
    // o comprador vê o motivo normalizado na janela do checkout
    expect(await getPaymentView(token)).toMatchObject({ state: "canceled", failureLabel: "Cancelado pelo cliente" });
  });

  it("TESTE 2: PIN introduzido sem saldo → FALHOU, «Saldo insuficiente na carteira do cliente» (nunca como cancelamento)", async () => {
    const { order, payment, token } = await buy();
    await notify(payment, "failed", "INS-2006: Insufficient balance");
    expect(await state(order.id)).toMatchObject({ order: "DECLINED", payment: "FAILED", code: "INSUFFICIENT_FUNDS", reason: "Saldo insuficiente na carteira do cliente" });
    expect((await row(order.id)).payments[0].failureReason).toBe("Saldo insuficiente na carteira do cliente");
    expect((await getPaymentView(token))!.failureLabel).toBe("Saldo insuficiente na carteira do cliente");
  });

  it("TESTE 3: pagamento confirmado pelo gateway → APROVADO, sem justificativa; venda, entrega e notificação criadas", async () => {
    const { order, payment } = await buy();
    await notify(payment, "paid");
    const s = await state(order.id);
    expect(s).toMatchObject({ order: "APPROVED", payment: "PAID", code: null, reason: null });
    expect(s.delivery).not.toBeNull();
    expect(await prisma.notification.count({ where: { eventKey: `sale:${order.id}` } })).toBe(1);
    expect((await row(order.id)).payments[0]).toEqual({ failureCode: null, failureReason: null });
  });

  it("TESTE 4: sem resposta imediata → continua PENDENTE (a reconciliação não falha pagamentos só por demorarem)", async () => {
    const { order, payment } = await buy("841234567"); // o gateway de teste responde «pendente» à consulta
    await prisma.payment.update({ where: { id: payment.id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
    expect((await reconcileStalePayments()).checked).toBe(1);
    expect(await state(order.id)).toMatchObject({ order: "PENDING", payment: "PENDING", code: null });
    // e o comprador não vê nenhuma justificativa enquanto está pendente
    expect((await getPaymentView((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).publicToken!))!.failureLabel).toBeNull();
  });

  it("TESTE 5: o mesmo aviso chega duas vezes → uma única venda, entrega e notificação", async () => {
    const { order, payment } = await buy();
    expect((await notify(payment, "paid", undefined, "evt-duplicado")).status).toBe(200);
    expect((await notify(payment, "paid", undefined, "evt-duplicado")).status).toBe(200);
    // outro aviso diferente para o mesmo pagamento também não duplica
    await notify(payment, "paid", undefined, "evt-outro");
    expect(await prisma.order.count({ where: { status: "APPROVED" } })).toBe(1);
    expect(await prisma.delivery.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { eventKey: `sale:${order.id}` } })).toBe(1);
    expect(await prisma.paymentEvent.count({ where: { externalEventId: "evt-duplicado" } })).toBe(1);
  });

  it("TESTE 6: confirmação depois de um período de espera (consulta automática) → APROVADO, sem duplicar com o aviso que chega depois", async () => {
    const { order, payment } = await buy("841112221"); // o gateway de teste confirma na consulta
    // ainda dentro do primeiro minuto: não é consultado
    expect((await reconcileStalePayments()).checked).toBe(0);
    await prisma.payment.update({ where: { id: payment.id }, data: { createdAt: new Date(Date.now() - 5 * 60_000) } });
    await reconcileStalePayments();
    expect(await state(order.id)).toMatchObject({ order: "APPROVED", payment: "PAID", reason: null });
    await notify(payment, "paid");
    expect(await prisma.order.count({ where: { status: "APPROVED" } })).toBe(1);
    expect(await prisma.delivery.count({ where: { orderId: order.id } })).toBe(1);
    // um aviso de falha tardio nunca anula um pagamento confirmado
    await notify(payment, "failed", "Insufficient balance");
    expect(await state(order.id)).toMatchObject({ order: "APPROVED", payment: "PAID" });
  });

  it("aviso com valor diferente nunca aprova a venda (proteção contra confirmação falsa)", async () => {
    const { order, payment } = await buy();
    await notify({ ...payment, amountCents: 100 }, "paid", undefined, "evt-valor-errado");
    expect(await state(order.id)).toMatchObject({ order: "PENDING", payment: "PENDING" });
    // assinatura inválida: rejeitado antes de qualquer processamento
    const raw = JSON.stringify({ eventId: "evt-falso", externalId: payment.externalId, reference: payment.idempotencyKey, status: "paid", amountCents: payment.amountCents, currency: "MZN", feeCents: 0 });
    expect((await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": "0".repeat(64) }))).status).toBe(401);
    expect((await state(order.id)).order).toBe("PENDING");
  });

  it("motivo desconhecido: guarda o texto real do gateway; sem motivo: diz que o gateway não o indicou", async () => {
    const a = await buy();
    await notify(a.payment, "failed", "Carteira bloqueada pela operadora");
    expect(await state(a.order.id)).toMatchObject({ payment: "FAILED", code: "GATEWAY_ERROR", reason: "Falhou: Carteira bloqueada pela operadora" });
    const b = await buy();
    await notify(b.payment, "canceled");
    expect(await state(b.order.id)).toMatchObject({ payment: "CANCELED", code: "UNKNOWN", reason: "O gateway não indicou o motivo" });
    // o texto bruto do gateway não é mostrado ao comprador
    expect((await getPaymentView(a.order.publicToken!))!.failureLabel).toBeNull();
  });
});

describe("classificação dos motivos (normalização entre gateways)", () => {
  it.each([
    ["Saldo insuficiente", "INSUFFICIENT_FUNDS"],
    ["Fundos insuficientes na conta", "INSUFFICIENT_FUNDS"],
    ["INSUFFICIENT_BALANCE", "INSUFFICIENT_FUNDS"],
    ["Insufficient funds", "INSUFFICIENT_FUNDS"],
    ["INS-2006", "INSUFFICIENT_FUNDS"],
    ["Transação cancelada pelo cliente", "CUSTOMER_CANCELLED"],
    ["User cancelled the request", "CUSTOMER_CANCELLED"],
    ["Rejected by customer", "CUSTOMER_CANCELLED"],
    ["INS-5 Transaction cancelled by customer", "CUSTOMER_CANCELLED"],
    ["PIN incorrecto", "WRONG_PIN"],
    ["Invalid PIN", "WRONG_PIN"],
    ["Request timeout", "TIMEOUT"],
    ["INS-9", "TIMEOUT"],
    ["Tempo de espera excedido", "TIMEOUT"],
    ["Erro interno", "GATEWAY_INTERNAL"],
    ["Payment was declined — O pagamento foi recusado. Pode criar uma nova tentativa.", "DECLINED"],
    ["Transaction failed", "DECLINED"],
    ["INS-6", "DECLINED"],
    ["Invalid MSISDN", "INVALID_NUMBER"],
    ["Número inválido", "INVALID_NUMBER"],
    ["Subscriber not found", "INVALID_NUMBER"],
    ["Payment expired", "EXPIRED"],
    ["Pedido expirado", "EXPIRED"],
    ["Internal server error", "GATEWAY_INTERNAL"],
    ["Declined by customer", "CUSTOMER_CANCELLED"],
    ["Erro qualquer sem padrão", null],
    ["", null],
  ])("%s → %s", (msg, code) => {
    expect(matchFailure(msg)).toBe(code);
  });

  it("só reclassifica entre estados finais não pagos; pago e pendente ficam intactos", () => {
    expect(classifyOutcome("failed", "cancelled by user")).toMatchObject({ state: "canceled", code: "CUSTOMER_CANCELLED" });
    expect(classifyOutcome("canceled", "Insufficient balance")).toMatchObject({ state: "failed", code: "INSUFFICIENT_FUNDS" });
    expect(classifyOutcome("pending", "cancelled by user")).toMatchObject({ state: "pending", code: null, reason: null });
    expect(classifyOutcome("paid", "Insufficient balance")).toMatchObject({ state: "paid", code: null, reason: null });
    expect(classifyOutcome("expired")).toMatchObject({ state: "expired", code: "TIMEOUT", reason: "Tempo de espera excedido" });
  });
});
