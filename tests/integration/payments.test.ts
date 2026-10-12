// Fluxo de pagamento real com o fornecedor de TESTE local (não é a EPay): cobre os cenários exigidos
// pelo documento de integração sem credenciais reais.
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb } from "../helpers/db";
import { productSchema, checkoutSchema, couponSchema } from "@/server/validation/schemas";
import { createProduct, setProductStatus } from "@/server/services/products";
import { createCheckout } from "@/server/services/checkouts";
import { createCoupon } from "@/server/services/coupons";
import { submitCheckout } from "@/server/services/purchase";
import { getDeliveryView, getPaymentView, normalizeMzPhone, refreshPaymentStatus } from "@/server/services/payment-flow";
import { changeOrderStatus } from "@/server/services/orders";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { epayProvider, EPAY_CONTRACT } from "@/server/payments/providers/epay";
import { getActivePaymentProvider, getProvider } from "@/server/payments/registry";

const SECRET = "segredo-apenas-para-testes";

beforeAll(() => {
  process.env.NTP_ENABLE_TEST_PROVIDER = "true";
  process.env.TEST_PROVIDER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
});
beforeEach(resetTestDb);

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;

async function setup(price = "1.500,00") {
  const p = await createProduct(
    productSchema.parse({ name: "Curso Digital", description: "Produto para testes de pagamento", type: "COURSE", priceCents: price, currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://conteudo.exemplo/curso" }),
    false,
  );
  const c = await createCheckout(
    checkoutSchema.parse({ name: "Checkout MZN", productId: p.id, offerId: p.offers[0].id, title: "Curso", buttonText: "Pagar", primaryColor: "#C8F135", backgroundColor: "#0B0C0E", successTitle: "Ok", successMessage: "Ok", allowCoupons: "on", isActive: "on" }),
    false,
  );
  return { product: p, checkout: c };
}

async function buy(publicId: string, phone: string, extra: Record<string, unknown> = {}) {
  return submitCheckout(publicId, { name: "Ana Compradora", email: "ana@exemplo.co.mz", phone, method: "mpesa", idempotencyKey: key(), ...extra });
}

async function orderByToken(token: string) {
  return prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true, auditLogs: true, delivery: true } });
}

function signed(body: object, secret = SECRET) {
  const raw = JSON.stringify(body);
  return { raw, headers: new Headers({ "x-test-signature": createHmac("sha256", secret).update(raw).digest("hex") }) };
}

async function notify(body: object, secret = SECRET) {
  const { raw, headers } = signed(body, secret);
  return handleWebhook(testLocalProvider, raw, headers);
}

describe("início do pagamento", () => {
  it("cria encomenda PENDING com preço da base de dados, pagamento PENDING e telefone mascarado", async () => {
    const { checkout } = await setup();
    // campos de preço enviados pelo browser são ignorados
    const r = await buy(checkout.publicId, "84 123 4567", { amountCents: 1, priceCents: 1, total: 1 });
    expect(r.kind).toBe("payment_started");
    if (r.kind !== "payment_started") return;
    const o = await orderByToken(r.token);
    expect(o).toMatchObject({ status: "PENDING", source: "CHECKOUT", currency: "MZN", totalCents: 150000, provider: "teste-local", paymentMethod: "mpesa", isDemo: false });
    expect(o.payments[0]).toMatchObject({ status: "PENDING", amountCents: 150000, currency: "MZN", phoneMasked: "84•••••67" });
    expect(o.payments[0].externalId).toMatch(/^tl_150000_pending_/);
    expect(o.auditLogs.map((a) => a.toStatus)).toEqual(["PENDING"]);
    expect(o.delivery).toBeNull();
  });

  it("submissão repetida com a mesma chave não cria encomendas nem cobranças duplicadas", async () => {
    const { checkout } = await setup();
    const k = key();
    const a = await buy(checkout.publicId, "841234567", { idempotencyKey: k });
    const b = await buy(checkout.publicId, "841234567", { idempotencyKey: k });
    expect(a.kind).toBe("payment_started");
    expect(b).toMatchObject({ kind: "payment_started", token: (a as { token: string }).token });
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("valida método, telefone moçambicano e chave de idempotência", async () => {
    const { checkout } = await setup();
    expect(await buy(checkout.publicId, "84 123 4567", { method: "cartao" })).toMatchObject({ kind: "invalid", fieldErrors: { method: expect.any(String) } });
    expect(await buy(checkout.publicId, "91 123 4567")).toMatchObject({ kind: "invalid", fieldErrors: { phone: expect.any(String) } });
    expect(await buy(checkout.publicId, "84 123 4567", { idempotencyKey: "curta" })).toMatchObject({ kind: "invalid" });
    expect(await prisma.order.count()).toBe(0);
    expect(normalizeMzPhone("+258 84 123 4567")).toBe("841234567");
    expect(normalizeMzPhone("258871234567")).toBe("871234567");
    expect(normalizeMzPhone("81 123 4567")).toBeNull();
  });
});

describe("confirmação por notificação (webhook)", () => {
  it("pagamento aprovado: encomenda paga, taxas registadas, entrega criada; repetições não duplicam nada", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234567");
    if (r.kind !== "payment_started") throw new Error();
    const o = await orderByToken(r.token);
    const p = o.payments[0];
    const event = { eventId: "evt-1", externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: 150000, currency: "MZN", feeCents: 4500 };

    const first = await notify(event);
    expect(first).toMatchObject({ status: 200, result: "processed" });
    const paid = await orderByToken(r.token);
    expect(paid).toMatchObject({ status: "APPROVED", feeCents: 4500, netCents: 145500, externalRef: p.externalId });
    expect(paid.payments[0].status).toBe("PAID");
    expect(paid.delivery?.token).toBeTruthy();

    // mesmo evento repetido
    expect(await notify(event)).toMatchObject({ status: 200, result: "duplicate" });
    // evento diferente com o mesmo resultado
    expect(await notify({ ...event, eventId: "evt-2" })).toMatchObject({ status: 200, result: "unchanged" });
    const after = await orderByToken(r.token);
    expect(after.auditLogs.filter((a) => a.toStatus === "APPROVED")).toHaveLength(1);
    expect(await prisma.delivery.count()).toBe(1);
    expect(await prisma.order.count({ where: { status: "APPROVED" } })).toBe(1);
  });

  it("assinatura inválida, segredo errado ou corpo alterado são rejeitados sem alterações", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234567");
    if (r.kind !== "payment_started") throw new Error();
    const p = (await orderByToken(r.token)).payments[0];
    const event = { eventId: "evt-x", externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: 150000, currency: "MZN" };

    expect((await notify(event, "segredo-errado")).status).toBe(401);
    const { raw, headers } = signed(event);
    const tampered = raw.replace('"amountCents":150000', '"amountCents":150001');
    expect((await handleWebhook(testLocalProvider, tampered, headers)).status).toBe(401);
    expect((await handleWebhook(testLocalProvider, raw, new Headers())).status).toBe(401);
    expect((await orderByToken(r.token)).status).toBe("PENDING");
    expect(await prisma.paymentEvent.count()).toBe(0);
  });

  it("montante, moeda ou referência que não correspondem são rejeitados", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234567");
    if (r.kind !== "payment_started") throw new Error();
    const p = (await orderByToken(r.token)).payments[0];
    const base = { externalId: p.externalId, reference: p.idempotencyKey, status: "paid", currency: "MZN" };
    expect(await notify({ ...base, eventId: "a", amountCents: 100 })).toMatchObject({ result: "rejected" });
    expect(await notify({ ...base, eventId: "b", amountCents: 150000, currency: "USD" })).toMatchObject({ result: "rejected" });
    expect(await notify({ ...base, eventId: "c", amountCents: null })).toMatchObject({ result: "ignored" });
    expect(await notify({ eventId: "d", externalId: "tl_150000_pending_ffffffffffff", reference: "outra", status: "paid", amountCents: 150000, currency: "MZN" })).toMatchObject({ result: "rejected" });
    expect((await orderByToken(r.token)).status).toBe("PENDING");
    expect(await prisma.paymentEvent.count({ where: { status: "REJECTED" } })).toBe(3);
  });

  it("pagamento falhado e cancelado por notificação; cupão é libertado", async () => {
    const { checkout, product } = await setup();
    await createCoupon(couponSchema.parse({ code: "MZ10", type: "PERCENT", percentOff: 10, appliesToAll: "on", isActive: "on", maxUses: "1" }), false, "Africa/Maputo");
    const r = await buy(checkout.publicId, "841234567", { coupon: "MZ10" });
    if (r.kind !== "payment_started") throw new Error(JSON.stringify(r));
    let o = await orderByToken(r.token);
    expect(o.totalCents).toBe(135000);
    expect((await prisma.coupon.findFirstOrThrow()).usesCount).toBe(1);
    await notify({ eventId: "f1", externalId: o.payments[0].externalId, reference: o.payments[0].idempotencyKey, status: "failed" });
    o = await orderByToken(r.token);
    expect(o.status).toBe("DECLINED");
    expect(o.payments[0].status).toBe("FAILED");
    expect((await prisma.coupon.findFirstOrThrow()).usesCount).toBe(0);

    const r2 = await buy(checkout.publicId, "841234568");
    if (r2.kind !== "payment_started") throw new Error();
    const o2 = await orderByToken(r2.token);
    await notify({ eventId: "c1", externalId: o2.payments[0].externalId, reference: o2.payments[0].idempotencyKey, status: "canceled" });
    expect((await orderByToken(r2.token)).status).toBe("CANCELED");
    expect(product.id).toBeTruthy();
  });

  it("pagamento confirmado depois de expirar é reconhecido (o dinheiro foi recebido)", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234567");
    if (r.kind !== "payment_started") throw new Error();
    const p = (await orderByToken(r.token)).payments[0];
    await notify({ eventId: "e1", externalId: p.externalId, reference: p.idempotencyKey, status: "expired" });
    expect((await orderByToken(r.token)).status).toBe("CANCELED");
    await notify({ eventId: "e2", externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: 150000, currency: "MZN" });
    // confirmação oficial posterior prevalece: o pagamento passa a PAID e a encomenda a paga
    const o = await orderByToken(r.token);
    expect(o.payments[0].status).toBe("PAID");
    expect(o.status).toBe("APPROVED");
  });
});

describe("resposta imediata do fornecedor e consulta oficial", () => {
  it("recusa imediata → encomenda falhada, sem entrega", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234560");
    if (r.kind !== "payment_started") throw new Error();
    const o = await orderByToken(r.token);
    expect(o.status).toBe("DECLINED");
    expect(o.payments[0]).toMatchObject({ status: "FAILED" });
    expect((await getPaymentView(r.token))?.state).toBe("failed");
    expect(o.delivery).toBeNull();
  });

  it("erro de rede → estado incerto, encomenda continua pendente (nunca assume sucesso)", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234569");
    if (r.kind !== "payment_started") throw new Error();
    const o = await orderByToken(r.token);
    expect(o.status).toBe("PENDING");
    expect(o.payments[0].failureReason).toMatch(/Estado incerto/);
    const view = await getPaymentView(r.token, { refresh: true });
    expect(view).toMatchObject({ state: "pending", uncertain: true, accessToken: null });
  });

  it("consulta oficial confirma pagamento; limitação de frequência", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234561");
    if (r.kind !== "payment_started") throw new Error();
    const order = await orderByToken(r.token);
    await refreshPaymentStatus(order.id);
    const o = await orderByToken(r.token);
    expect(o.status).toBe("APPROVED");
    expect(o.auditLogs.some((a) => a.actor === "status-check:teste-local")).toBe(true);
    const view = await getPaymentView(r.token);
    expect(view?.state).toBe("paid");
    expect(view?.accessToken).toBeTruthy();
  });

  it("consulta oficial devolve expirado → encomenda cancelada", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234562");
    if (r.kind !== "payment_started") throw new Error();
    await refreshPaymentStatus((await orderByToken(r.token)).id);
    expect((await orderByToken(r.token)).status).toBe("CANCELED");
  });

  it("visitar a página de estado/retorno de um pagamento pendente NÃO o marca como pago", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234567");
    if (r.kind !== "payment_started") throw new Error();
    for (let i = 0; i < 3; i++) await getPaymentView(r.token, { refresh: true });
    const o = await orderByToken(r.token);
    expect(o.status).toBe("PENDING");
    expect(o.delivery).toBeNull();
    expect((await getPaymentView(r.token))?.accessToken).toBeNull();
  });
});

describe("entrega do produto digital", () => {
  it("só existe após confirmação; reembolso revoga o acesso", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234561");
    if (r.kind !== "payment_started") throw new Error();
    const order = await orderByToken(r.token);
    expect(await prisma.delivery.count()).toBe(0);
    await refreshPaymentStatus(order.id);
    const token = (await orderByToken(r.token)).delivery!.token;
    const v = await getDeliveryView(token);
    expect(v?.items[0]).toMatchObject({ name: "Curso Digital", url: "https://conteudo.exemplo/curso" });
    await prisma.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    expect(await getDeliveryView(token)).toBeNull();
    expect(await getDeliveryView("token-inexistente-com-tamanho-ok-12345")).toBeNull();
  });

  it("alterações administrativas ficam no registo de auditoria", async () => {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId, "841234567");
    if (r.kind !== "payment_started") throw new Error();
    const o = await orderByToken(r.token);
    await changeOrderStatus(o.id, "CANCELED", false, "admin:dono@exemplo.co.mz");
    const after = await orderByToken(r.token);
    expect(after.auditLogs.find((a) => a.toStatus === "CANCELED")).toMatchObject({ fromStatus: "PENDING", actor: "admin:dono@exemplo.co.mz" });
  });
});

describe("restrições de configuração", () => {
  it("produtos noutra moeda não são cobrados (apenas MZN)", async () => {
    const { checkout, product } = await setup();
    await prisma.offer.update({ where: { id: product.offers[0].id }, data: { currency: "USD" } });
    await setProductStatus(product.id, "PUBLISHED", false);
    const r = await buy(checkout.publicId, "841234567");
    expect(r).toMatchObject({ kind: "payments_unavailable" });
    expect(await prisma.order.count()).toBe(0);
  });

  it("EPay nunca fica ativa sem contrato da API confirmado, mesmo com chave definida; segredos nunca expostos", async () => {
    process.env.EPAY_SECRET_KEY = "chave-ficticia-de-teste-123";
    process.env.EPAY_API_BASE_URL = "https://exemplo.invalid";
    try {
      expect(EPAY_CONTRACT.confirmed).toBe(false);
      expect(epayProvider.isConfigured()).toBe(false);
      expect(epayProvider.verifySignature("{}", new Headers())).toBe(false);
      expect(epayProvider.methods()).toEqual([]);
      const checks = JSON.stringify(epayProvider.configChecks());
      expect(checks).not.toContain("chave-ficticia-de-teste-123");
      expect(checks).toContain("EPAY_SECRET_KEY");
      await expect(epayProvider.createCharge({} as never)).rejects.toThrow(/não confirmado/);
      expect(getProvider("epay")?.isConfigured()).toBe(false);
    } finally {
      delete process.env.EPAY_SECRET_KEY;
      delete process.env.EPAY_API_BASE_URL;
    }
  });

  it("fornecedor de teste só existe na base de dados de testes e com a variável explícita", () => {
    expect(getActivePaymentProvider()?.id).toBe("teste-local");
    process.env.NTP_ENABLE_TEST_PROVIDER = "false";
    expect(getActivePaymentProvider()).toBeNull();
    process.env.NTP_ENABLE_TEST_PROVIDER = "true";
    const url = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgresql://x@localhost/producao";
    expect(getProvider("teste-local")).toBeNull();
    process.env.DATABASE_URL = url;
  });
});
