import { createHmac } from "crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb } from "../helpers/db";
import { handleWebhook, verifyHmacSha256 } from "@/server/payments/webhooks";
import type { NormalizedPaymentEvent, PaymentProvider } from "@/server/payments/types";
import { createProduct } from "@/server/services/products";
import { createManualOrder } from "@/server/services/orders";
import { productSchema } from "@/server/validation/schemas";

const SECRET = "segredo-de-teste";

// Fornecedor fictício usado apenas nos testes para exercitar o pipeline de webhooks.
const fakeProvider: PaymentProvider = {
  id: "fake",
  displayName: "Fake",
  isConfigured: () => true,
  createCharge: async () => ({ kind: "error", message: "n/a" }),
  verifySignature: (raw, headers) => verifyHmacSha256(raw, headers.get("x-signature"), SECRET),
  parseEvent: (raw) => JSON.parse(raw) as NormalizedPaymentEvent,
};

const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

async function pendingOrder() {
  const p = await createProduct(
    productSchema.parse({ name: "Produto", description: "Descrição suficiente", type: "EBOOK", priceCents: "100,00", currency: "BRL", status: "PUBLISHED" }),
    false,
  );
  return createManualOrder({ productId: p.id, offerId: p.offers[0].id, customerName: "C", customerEmail: "c@x.pt", status: "PENDING" }, false);
}

beforeEach(resetTestDb);

describe("webhooks de pagamento (preparação)", () => {
  it("rejeita assinatura inválida sem alterar o pedido", async () => {
    const order = await pendingOrder();
    const body = JSON.stringify({ externalEventId: "e1", type: "payment.approved", orderCode: order.code, amountCents: 10000, currency: "BRL", externalRef: "x", feeCents: 0 });
    const r = await handleWebhook(fakeProvider, body, new Headers({ "x-signature": "0".repeat(64) }));
    expect(r.status).toBe(401);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("evento válido aprova o pedido e regista taxas; duplicado é idempotente", async () => {
    const order = await pendingOrder();
    const body = JSON.stringify({ externalEventId: "e2", type: "payment.approved", orderCode: order.code, amountCents: 10000, currency: "BRL", externalRef: "ch_1", feeCents: 399 });
    const r1 = await handleWebhook(fakeProvider, body, new Headers({ "x-signature": sign(body) }));
    expect(r1.body).toMatchObject({ received: true, result: "processed" });
    const o = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(o).toMatchObject({ status: "APPROVED", feeCents: 399, netCents: 9601, externalRef: "ch_1" });
    const r2 = await handleWebhook(fakeProvider, body, new Headers({ "x-signature": sign(body) }));
    expect(r2.body).toMatchObject({ duplicate: true });
    expect(await prisma.paymentEvent.count()).toBe(1);
  });

  it("valor divergente é rejeitado; transição inválida é ignorada", async () => {
    const order = await pendingOrder();
    const bad = JSON.stringify({ externalEventId: "e3", type: "payment.approved", orderCode: order.code, amountCents: 1, currency: "BRL", externalRef: null, feeCents: null });
    expect((await handleWebhook(fakeProvider, bad, new Headers({ "x-signature": sign(bad) }))).body).toMatchObject({ result: "rejected" });
    const refund = JSON.stringify({ externalEventId: "e4", type: "payment.refunded", orderCode: order.code, amountCents: null, currency: null, externalRef: null, feeCents: null });
    expect((await handleWebhook(fakeProvider, refund, new Headers({ "x-signature": sign(refund) }))).body).toMatchObject({ result: "ignored" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });
});
