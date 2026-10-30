// Limpar histórico de vendas (compras de teste do próprio vendedor) e checkout sempre igual ao produto.
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct, updateProduct } from "@/server/services/products";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { clearSalesHistory, deleteOrder, salesHistoryCounts } from "@/server/services/sales-history";
import { checkoutViewData } from "@/server/services/checkout-view-data";
import { getPublicCheckout } from "@/server/services/checkouts";
import { getSettings } from "@/server/services/settings";
import { saveMedia } from "@/server/services/media";
import { scopeOf, type Scope } from "@/server/scope";
import { displayEmail, isPhoneOnlyEmail } from "@/lib/buyer-email";

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
let ownerId: string;
let slug: string;
let productId: string;
beforeEach(async () => {
  await resetTestDb();
  ownerId = (await testOwner()).id;
  S = scopeOf(ownerId, false);
  const p = await createProduct(productSchema.parse({ name: "Curso", description: "Descrição do produto de teste.", type: "COURSE", priceCents: "250,00", currency: "MZN", status: "DRAFT", deliveryUrl: "https://area.exemplo.co.mz/membros" }), S);
  await publishProduct(p.id, S);
  slug = p.primaryCheckout.slug!;
  productId = p.id;
});

let seq = 0;
async function paidSale() {
  const r = await submitCheckout(slug, { name: "Ana", email: `ana${seq}@exemplo.co.mz`, phone: "841234567", method: "mpesa", idempotencyKey: `idem${Date.now()}${seq++}abcdefgh` });
  if (r.kind !== "payment_started") throw new Error(r.kind);
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: `ev_${p.id}`, externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
  return o.id;
}

describe("limpar histórico de vendas", () => {
  it("só pagamentos de teste: as vendas reais ficam intactas", async () => {
    const a = await paidSale();
    const b = await paidSale();
    await prisma.order.updateMany({ where: { id: { in: [a, b] } }, data: { isTestPayment: false } });
    await prisma.order.update({ where: { id: a }, data: { isTestPayment: true } });
    expect(await salesHistoryCounts(ownerId)).toEqual({ orders: 2, testOrders: 1 });
    expect(await clearSalesHistory(ownerId, "test")).toBe(1);
    expect((await prisma.order.findMany()).map((o) => o.id)).toEqual([b]);
    expect(await prisma.notification.count({ where: { eventKey: `sale:${a}` } })).toBe(0);
    expect(await prisma.notification.count({ where: { eventKey: `sale:${b}` } })).toBe(1);
  });

  it("todo o histórico: pedidos, pagamentos, entregas, avisos, notificações, visitas e clientes; produtos e checkouts ficam", async () => {
    await paidSale();
    await paidSale();
    expect(await prisma.delivery.count()).toBe(2);
    expect(await clearSalesHistory(ownerId, "all")).toBe(2);
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
    expect(await prisma.paymentEvent.count()).toBe(0);
    expect(await prisma.delivery.count()).toBe(0);
    expect(await prisma.customer.count()).toBe(0);
    expect(await prisma.checkoutSession.count()).toBe(0);
    expect(await prisma.notification.count({ where: { eventKey: { startsWith: "sale:" } } })).toBe(0);
    expect(await prisma.product.count()).toBe(1);
    expect((await getPublicCheckout(slug)).state).toBe("ok");
  });

  it("eliminar um pedido; nunca pedidos de outra conta", async () => {
    const a = await paidSale();
    const b = await paidSale();
    expect(await deleteOrder(ownerId, a)).toBe(1);
    expect(await prisma.order.count({ where: { id: b } })).toBe(1);
    const other = await prisma.user.create({ data: { email: "outro@exemplo.co.mz", name: "Outro", passwordHash: "x", status: "APPROVED" } });
    await expect(deleteOrder(other.id, b)).rejects.toThrow();
    expect(await clearSalesHistory(other.id, "all")).toBe(0);
    expect(await prisma.order.count({ where: { id: b } })).toBe(1);
  });
});

describe("checkout segue o produto", () => {
  const view = async () => {
    const r = await getPublicCheckout(slug);
    if (r.state !== "ok") throw new Error("indisponível");
    return checkoutViewData(r.checkout, await getSettings(ownerId));
  };

  it("nome, descrição, preço e imagem atualizados no produto aparecem no checkout", async () => {
    // mesmo que o checkout tenha textos/imagem antigos guardados
    await prisma.checkout.update({ where: { slug }, data: { title: "Título antigo", description: "Antiga", imageUrl: "https://antiga.exemplo/img.png" } });
    const img = await saveMedia(ownerId, { name: "foto.png", bytes: png(300, 450) });
    const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    await updateProduct(productId, productSchema.parse({ name: "Curso Novo", description: "Nova descrição do produto.", type: p.type, priceCents: "300,00", currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://area.exemplo.co.mz/membros", imageUrl: `/api/public/media/${img.id}` }), S);
    const v = await view();
    expect(v).toMatchObject({ title: "Curso Novo", description: "Nova descrição do produto.", priceCents: 30000, imageUrl: `/api/public/media/${img.id}` });
    // tamanho real da foto para a mostrar inteira (sem cortes nem ampliação)
    expect(v.cardImageSize).toEqual({ width: 300, height: 450 });
  });
});

/** PNG mínimo válido com as dimensões pedidas (só o cabeçalho conta para o tamanho). */
function png(w: number, h: number) {
  const b = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

describe("pedir email no checkout (opção do produto)", () => {
  it("ativado por omissão: o email é obrigatório", async () => {
    const r = await submitCheckout(slug, { name: "Ana Silva", phone: "841234567", method: "mpesa", idempotencyKey: `idem${Date.now()}x1abcdefgh` });
    expect(r.kind).toBe("invalid");
  });

  it("desativado: compra só com nome e número; o telefone passa a ser obrigatório; nunca é mostrado um email falso", async () => {
    const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    await updateProduct(productId, productSchema.parse({ name: p.name, description: p.description, type: p.type, priceCents: "250,00", currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://area.exemplo.co.mz/membros", collectEmail: "false" }), S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).collectEmail).toBe(false);
    const r0 = await getPublicCheckout(slug);
    if (r0.state !== "ok") throw new Error("indisponível");
    expect(await checkoutViewData(r0.checkout, await getSettings(ownerId))).toMatchObject({ collectEmail: false, collectPhone: true, requirePhone: true });
    // sem número: recusado
    expect((await submitCheckout(slug, { name: "Ana Silva", method: "mpesa", idempotencyKey: `idem${Date.now()}x2abcdefgh` })).kind).toBe("invalid");
    const r = await submitCheckout(slug, { name: "Ana Silva", phone: "84 123 4567", method: "mpesa", idempotencyKey: `idem${Date.now()}x3abcdefgh` });
    expect(r.kind).toBe("payment_started");
    const customer = await prisma.customer.findFirstOrThrow();
    expect(isPhoneOnlyEmail(customer.email)).toBe(true);
    expect(displayEmail(customer.email)).toBe("Sem email");
    // voltar a ativar (o formulário envia sempre o interruptor)
    await updateProduct(productId, productSchema.parse({ name: p.name, description: p.description, type: p.type, priceCents: "250,00", currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://area.exemplo.co.mz/membros", collectEmail: "true" }), S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: productId } })).collectEmail).toBe(true);
  });
});
