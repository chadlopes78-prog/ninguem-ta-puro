// Apresentação no checkout por produto: mostrar/ocultar o campo de e-mail e o nome do produto.
// Só muda o que o comprador vê: o nome continua guardado, nos pedidos e na descrição enviada ao gateway.
import { createHmac } from "crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

const { prisma } = await import("@/server/db");
const { resetTestDb, testOwner } = await import("../helpers/db");
const { productSchema } = await import("@/server/validation/schemas");
const { createProduct, publishProduct, updateProduct } = await import("@/server/services/products");
const { submitCheckout } = await import("@/server/services/purchase");
const { getPublicCheckout } = await import("@/server/services/checkouts");
const { checkoutViewData } = await import("@/server/services/checkout-view-data");
const { getSettings } = await import("@/server/services/settings");
const { getPaymentView } = await import("@/server/services/payment-flow");
const { publicDesign } = await import("@/server/services/checkout-design");
const { classicDesign } = await import("@/lib/checkout-design");
const { handleWebhook } = await import("@/server/payments/webhooks");
const { testLocalProvider } = await import("@/server/payments/providers/test-local");
const { listOrders } = await import("@/server/services/orders");
const { getFinanceReport } = await import("@/server/services/finance");
const { CheckoutView } = await import("@/components/checkouts/checkout-view");
const { scopeOf } = await import("@/server/scope");
const { resolveRange } = await import("@/lib/dates");
type Scope = import("@/server/scope").Scope;

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
beforeEach(async () => {
  await resetTestDb();
  ownerId = (await testOwner()).id;
  S = scopeOf(ownerId, false);
});
afterEach(() => vi.restoreAllMocks());

const base = (name: string, extra: Record<string, unknown> = {}) =>
  productSchema.parse({ name, description: `${name}: descrição do produto de teste.`, type: "DIGITAL", priceCents: "150,00", currency: "MZN", status: "DRAFT", deliveryUrl: "https://area.exemplo.co.mz/membros", ...extra });

async function product(name: string, opts: { showName: boolean; collectEmail: boolean }) {
  const p = await createProduct(base(name, { showName: String(opts.showName), collectEmail: String(opts.collectEmail) }), S);
  await publishProduct(p.id, S);
  return { id: p.id, slug: p.primaryCheckout.slug! };
}

/** HTML público do checkout (o mesmo componente da página), com o design padrão e o clássico. */
async function html(slug: string) {
  const r = await getPublicCheckout(slug);
  if (r.state !== "ok") throw new Error("indisponível");
  const data = { ...(await checkoutViewData(r.checkout, await getSettings(ownerId))), paymentOptions: [{ id: "e2payments:mpesa", providerId: "e2payments", providerName: "E2Payments", label: "M-Pesa", requiresPhone: true, hosted: null }] };
  const render = (design: ReturnType<typeof publicDesign>) => renderToStaticMarkup(createElement(CheckoutView, { design, data, mode: "preview" }));
  return { paygate: render(publicDesign(r.checkout)), classic: render(classicDesign(publicDesign(r.checkout).theme)), data };
}

let seq = 0;
async function buy(slug: string, withEmail: boolean) {
  const r = await submitCheckout(slug, { name: "Ana Compradora", ...(withEmail ? { email: `ana${seq}@exemplo.co.mz` } : {}), phone: "841234567", method: "mpesa", idempotencyKey: `idem${Date.now()}${seq++}abcdefgh` });
  return r;
}

describe("nome do produto no checkout", () => {
  it("TESTE 1: «Receita de Bebê» com o nome desactivado — oculto no checkout, guardado internamente e enviado ao gateway", async () => {
    const { id, slug } = await product("Receita de Bebê", { showName: false, collectEmail: true });
    const { paygate, classic, data } = await html(slug);
    expect(data.showProductName).toBe(false);
    expect(paygate).not.toContain("Receita de Bebê");
    expect(classic).not.toContain("Receita de Bebê");
    // o preço e o formulário continuam lá
    expect(paygate).toContain("150,00");
    expect(paygate).toContain('data-testid="pay-button"');
    // guardado internamente
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).name).toBe("Receita de Bebê");
    // enviado ao gateway na descrição da compra
    const spy = vi.spyOn(testLocalProvider, "createCharge");
    const r = await buy(slug, true);
    expect(r.kind).toBe("payment_started");
    expect(spy.mock.calls[0][0].description).toContain("Receita de Bebê");
    // a página de pagamento pública não revela o nome; o pedido guarda-o
    const view = await getPaymentView((r as { token: string }).token);
    expect(view!.items.map((i) => i.description)).toEqual(["A tua compra"]);
    expect((await prisma.orderItem.findFirstOrThrow()).description).toContain("Receita de Bebê");
  });

  it("TESTE 2: activar de novo o nome — aparece normalmente", async () => {
    const { id, slug } = await product("Receita de Bebê", { showName: false, collectEmail: true });
    await updateProduct(id, base("Receita de Bebê", { status: "PUBLISHED", showName: "true" }), S);
    const { paygate, classic, data } = await html(slug);
    expect(data.showProductName).toBe(true);
    expect(paygate).toContain("Receita de Bebê");
    expect(classic).toContain("Receita de Bebê");
  });
});

describe("campo de e-mail no checkout", () => {
  it("TESTE 3: e-mail desactivado — campo removido e pagamento sem e-mail", async () => {
    const { slug } = await product("Manual Sem Email", { showName: true, collectEmail: false });
    const { paygate, classic } = await html(slug);
    expect(paygate).not.toContain('name="email"');
    expect(classic).not.toContain('name="email"');
    expect((await buy(slug, false)).kind).toBe("payment_started");
  });

  it("TESTE 4: e-mail activado — campo presente e validado", async () => {
    const { slug } = await product("Manual Com Email", { showName: true, collectEmail: true });
    const { paygate } = await html(slug);
    expect(paygate).toContain('name="email"');
    expect((await buy(slug, false)).kind).toBe("invalid");
    const bad = await submitCheckout(slug, { name: "Ana Compradora", email: "isto-nao-e-email", phone: "841234567", method: "mpesa", idempotencyKey: `idem${Date.now()}zzabcdefgh` });
    expect(bad).toMatchObject({ kind: "invalid", fieldErrors: { email: expect.any(String) } });
    expect((await buy(slug, true)).kind).toBe("payment_started");
  });
});

describe("configurações independentes e venda", () => {
  it("TESTE 5: produtos com configurações diferentes — cada checkout respeita as suas", async () => {
    const a = await product("Receita de Bebê", { showName: false, collectEmail: false });
    const b = await product("Manual de Exercícios", { showName: true, collectEmail: true });
    const c = await product("Curso Online", { showName: false, collectEmail: true });
    const [ha, hb, hc] = await Promise.all([html(a.slug), html(b.slug), html(c.slug)]);
    expect(ha.paygate).not.toContain("Receita de Bebê");
    expect(ha.paygate).not.toContain('name="email"');
    expect(hb.paygate).toContain("Manual de Exercícios");
    expect(hb.paygate).toContain('name="email"');
    expect(hc.paygate).not.toContain("Curso Online");
    expect(hc.paygate).toContain('name="email"');
    // alterar um produto não mexe nos outros
    await updateProduct(b.id, base("Manual de Exercícios", { status: "PUBLISHED", showName: "false", collectEmail: "true" }), S);
    const rows = await prisma.product.findMany({ select: { name: true, showName: true, collectEmail: true }, orderBy: { name: "asc" } });
    expect(rows).toEqual([
      { name: "Curso Online", showName: false, collectEmail: true },
      { name: "Manual de Exercícios", showName: false, collectEmail: true },
      { name: "Receita de Bebê", showName: false, collectEmail: false },
    ]);
  });

  it("TESTE 6: compra confirmada — aparece em Operações e nos relatórios com o nome interno do produto", async () => {
    const { slug } = await product("Receita de Bebê", { showName: false, collectEmail: false });
    const r = await buy(slug, false);
    expect(r.kind).toBe("payment_started");
    const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: (r as { token: string }).token }, include: { payments: true } });
    await prisma.order.update({ where: { id: order.id }, data: { isTestPayment: false } });
    const p = order.payments[0];
    const raw = JSON.stringify({ eventId: `ev_${p.id}`, externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
    await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("APPROVED");
    const ops = await listOrders({ scope: S });
    const row = ops.rows.find((o) => o.id === order.id)!;
    expect(JSON.stringify(row)).toContain("Receita de Bebê");
    const report = await getFinanceReport({ scope: S, range: resolveRange({ preset: "30d" }, "Africa/Maputo"), defaultCurrency: "MZN", tz: "Africa/Maputo" });
    expect(JSON.stringify(report)).toContain("Receita de Bebê");
  });
});
