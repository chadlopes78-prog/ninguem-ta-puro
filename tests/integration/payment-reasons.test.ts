// Motivo real de cada pagamento, do aviso do gateway até ao checkout (mensagem para o comprador) e às Operações
// (justificativa, código original e texto do gateway). Os 12 cenários pedidos, com o fornecedor de TESTE local:
// os avisos assinados levam os textos/códigos que os gateways repassam (ex.: códigos da API M-Pesa). Nada contacta
// gateways reais.
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
import { buyerFailureMessage, classifyOutcome } from "@/server/payments/outcome";
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
const newKey = () => `rz${Date.now().toString(36)}${(seq++).toString(36)}abcdefghij`;
async function buy(phone = "841234567", key = newKey()) {
  const r = await submitCheckout(slug, { name: "Ana Compradora", email: "ana@exemplo.co.mz", phone, method: "mpesa", idempotencyKey: key });
  if (r.kind !== "payment_started") throw new Error(JSON.stringify(r));
  const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token }, include: { payments: true } });
  return { r, token: r.token, order, payment: order.payments[0] };
}
async function notify(p: { id: string; externalId: string | null; idempotencyKey: string; amountCents: number }, status: string, message?: string, eventId = `ev_${p.id}_${status}_${seq++}`) {
  const raw = JSON.stringify({ eventId, externalId: p.externalId, reference: p.idempotencyKey, status, amountCents: status === "paid" ? p.amountCents : null, currency: "MZN", feeCents: 0, ...(message ? { message } : {}) });
  return handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
}
const view = (token: string) => getPaymentView(token);
const ops = async (orderId: string) => (await listOrders({ scope: S })).rows.find((r) => r.id === orderId)!;
const pay = (orderId: string) => prisma.payment.findFirstOrThrow({ where: { orderId } });

describe("motivo real de cada pagamento (checkout + Operações)", () => {
  it("1. aprovado: «Aprovado», sem justificativa", async () => {
    const { order, payment, token } = await buy();
    await notify(payment, "paid");
    expect(await view(token)).toMatchObject({ state: "paid", failureLabel: null, failureCode: null });
    expect((await ops(order.id)).payments[0]).toEqual({ failureCode: null, failureReason: null });
  });

  const cases: [string, string, string, string, string, string][] = [
    // [cenário, estado enviado pelo gateway, motivo do gateway, código, justificativa Operações, mensagem ao comprador]
    ["2. cliente cancela", "failed", "INS-5 Transaction cancelled by customer", "CUSTOMER_CANCELLED", "Cancelado pelo cliente", "Pagamento cancelado. Pode iniciar uma nova tentativa quando desejar."],
    ["3. saldo insuficiente", "failed", "INS-2006 Insufficient balance", "INSUFFICIENT_FUNDS", "Saldo insuficiente na carteira do cliente", "Saldo insuficiente na sua carteira. Recarregue e tente novamente."],
    ["4. PIN incorrecto", "failed", "Invalid PIN entered", "WRONG_PIN", "PIN incorrecto", "PIN incorrecto. Verifique o seu PIN e tente novamente."],
    ["5. número inválido", "failed", "INS-2051 MSISDN invalid", "INVALID_NUMBER", "Número inválido ou sem carteira móvel activa", "O número de telefone introduzido não é válido."],
    ["6. operador recusa", "failed", "INS-6 Transaction Failed", "DECLINED", "Recusado pelo operador", "A operadora recusou o pagamento. Pode tentar novamente."],
    ["7. expirado (tempo de confirmação)", "failed", "INS-9 Request timeout", "TIMEOUT", "Tempo de espera excedido", "O tempo para confirmar o pagamento expirou. Inicie uma nova tentativa."],
    ["8. gateway/operador temporariamente indisponível", "failed", "INS-16 Unable to handle the request due to a temporary overloading", "GATEWAY_INTERNAL", "Erro temporário do gateway/operador", "O serviço de pagamentos está temporariamente indisponível. Tente novamente dentro de instantes."],
  ];
  for (const [name, status, message, code, label, buyer] of cases) {
    it(`${name}: estado e motivo próprios; texto original guardado`, async () => {
      const { order, payment, token } = await buy();
      expect((await notify(payment, status, message)).status).toBe(200);
      const p = await pay(order.id);
      expect(p).toMatchObject({ failureCode: code, failureReason: label, gatewayMessage: message });
      expect(p.status).toBe(code === "CUSTOMER_CANCELLED" ? "CANCELED" : "FAILED");
      expect((await view(token))!).toMatchObject({ failureCode: code, failureLabel: buyer });
      expect((await ops(order.id)).payments[0]).toEqual({ failureCode: code, failureReason: label });
      // o comprador nunca vê o texto técnico do gateway
      expect((await view(token))!.failureLabel).not.toContain("INS-");
    });
  }

  it("7b. timeout na criação: nunca dá falha definitiva — fica a confirmar e a consulta decide", async () => {
    const r = await submitCheckout(slug, { name: "Ana Compradora", email: "ana@exemplo.co.mz", phone: "841234569", method: "mpesa", idempotencyKey: newKey() });
    expect(r).toMatchObject({ kind: "payment_started", uncertain: true });
    const o = await prisma.order.findFirstOrThrow({ include: { payments: true } });
    expect(o.status).toBe("PENDING");
    expect(o.payments[0].failureReason).toMatch(/^Estado incerto/);
    // a reconciliação não transforma um resultado desconhecido em falha nem em cancelamento
    await prisma.payment.update({ where: { id: o.payments[0].id }, data: { createdAt: new Date(Date.now() - 10 * 60_000) } });
    await reconcileStalePayments();
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PENDING");
  });

  it("9. nova tentativa depois de uma falha: novo pedido e nova referência; a tentativa anterior fica no histórico", async () => {
    const a = await buy();
    await notify(a.payment, "failed", "INS-2006 Insufficient balance");
    const b = await buy();
    expect(b.order.id).not.toBe(a.order.id);
    expect(b.payment.idempotencyKey).not.toBe(a.payment.idempotencyKey);
    await notify(b.payment, "paid");
    const all = await prisma.order.findMany({ orderBy: { createdAt: "asc" } });
    expect(all.map((o) => o.status)).toEqual(["DECLINED", "APPROVED"]);
  });

  it("10. vários cliques no botão pagar: a mesma tentativa em simultâneo → 1 pedido e 1 cobrança", async () => {
    const key = newKey();
    const results = await Promise.all(Array.from({ length: 6 }, () => submitCheckout(slug, { name: "Ana Compradora", email: "ana@exemplo.co.mz", phone: "841234567", method: "mpesa", idempotencyKey: key })));
    const tokens = new Set(results.map((r) => (r.kind === "payment_started" ? r.token : r.kind)));
    expect(tokens.size).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("11. resposta atrasada do operador: nunca altera uma compra mais recente nem anula um pagamento confirmado", async () => {
    const a = await buy();
    await notify(a.payment, "failed", "INS-9 Request timeout");
    const b = await buy();
    await notify(b.payment, "paid");
    // aviso atrasado de falha para o pagamento já confirmado → ignorado
    await notify(b.payment, "failed", "INS-6 Transaction Failed");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: b.order.id } })).status).toBe("APPROVED");
    // aviso atrasado da tentativa antiga → só mexe na tentativa antiga
    await notify(a.payment, "failed", "INS-5 Transaction cancelled by customer");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: b.order.id } })).status).toBe("APPROVED");
    expect(await prisma.order.count({ where: { status: "APPROVED" } })).toBe(1);
  });

  it("12. aviso duplicado: processado uma única vez", async () => {
    const { order, payment } = await buy();
    expect((await notify(payment, "paid", undefined, "evt-dup")).status).toBe(200);
    expect((await notify(payment, "paid", undefined, "evt-dup")).status).toBe(200);
    expect(await prisma.paymentEvent.count({ where: { externalEventId: "evt-dup" } })).toBe(1);
    expect(await prisma.delivery.count({ where: { orderId: order.id } })).toBe(1);
    expect(await prisma.notification.count({ where: { eventKey: `sale:${order.id}` } })).toBe(1);
  });
});

describe("regras de classificação", () => {
  it("Pagar cancela sozinha ao fim de 3 min (documentado): CANCELLED sem motivo depois disso → expirado; antes → não indicado", () => {
    expect(classifyOutcome("canceled", null, { autoCancelAfterMs: 180_000, ageMs: 181_000 })).toMatchObject({ state: "canceled", code: "EXPIRED" });
    expect(classifyOutcome("canceled", null, { autoCancelAfterMs: 180_000, ageMs: 40_000 })).toMatchObject({ code: "UNKNOWN" });
    // com motivo explícito do cliente, é cancelamento mesmo depois do prazo
    expect(classifyOutcome("canceled", "Cancelled by customer", { autoCancelAfterMs: 180_000, ageMs: 200_000 })).toMatchObject({ code: "CUSTOMER_CANCELLED" });
    // gateways sem prazo documentado (EPay): nunca se presume expiração
    expect(classifyOutcome("canceled", null, { ageMs: 999_000 })).toMatchObject({ code: "UNKNOWN" });
  });

  it("códigos com sublinhados (USER_CANCELLED, INVALID_PIN, CANCELLED_BY_USER) e conta inactiva", () => {
    expect(classifyOutcome("failed", "USER_CANCELLED").code).toBe("CUSTOMER_CANCELLED");
    expect(classifyOutcome("failed", "CANCELLED_BY_USER").code).toBe("CUSTOMER_CANCELLED");
    expect(classifyOutcome("failed", "INVALID_PIN").code).toBe("WRONG_PIN");
    expect(classifyOutcome("failed", "INS-996 Customer Account Status Not Active").code).toBe("ACCOUNT_INACTIVE");
    expect(classifyOutcome("failed", "Carteira bloqueada pela operadora").code).toBe("ACCOUNT_INACTIVE");
  });

  it("mensagem ao comprador: recusa genérica usa a mensagem segura do gateway; motivos conhecidos usam o texto próprio", () => {
    expect(buyerFailureMessage("DECLINED", "O pagamento foi recusado. Pode criar uma nova tentativa.")).toBe("O pagamento foi recusado. Pode criar uma nova tentativa.");
    expect(buyerFailureMessage("INSUFFICIENT_FUNDS", "O pagamento foi recusado.")).toBe("Saldo insuficiente na sua carteira. Recarregue e tente novamente.");
    expect(buyerFailureMessage(null, null)).toBe("O pagamento não foi concluído. Pode tentar novamente.");
  });
});
