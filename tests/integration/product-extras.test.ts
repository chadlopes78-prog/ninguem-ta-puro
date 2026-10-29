// Formulário do produto simplificado (sessão 27): Pixel do Facebook por produto e link de upsell que cria o fluxo
// automaticamente na aba Funis. Pagamentos apenas pelo fornecedor de TESTE local (notificação assinada).
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct } from "@/server/services/products";
import { checkProductPixel, listMetaPixels, productPixel, setProductPixel } from "@/server/services/meta-capi";
import { productUpsellUrl, setProductUpsellUrl, UPSELL_STEP_LABEL } from "@/server/services/product-upsell";
import { nextDestination } from "@/server/services/post-purchase";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { scopeOf, type Scope } from "@/server/scope";

const SECRET = "segredo-apenas-para-testes";
const TOKEN = "EAAtokenfictícioapenasparatestes0123456789";
beforeAll(() => {
  process.env.NTP_ENABLE_TEST_PROVIDER = "true";
  process.env.TEST_PROVIDER_SECRET = SECRET;
  process.env.INTEGRATIONS_ENCRYPTION_KEY = "chave-de-cifra-apenas-para-testes-0123456789";
});
afterAll(() => {
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
});

const form = (name: string) => productSchema.parse({ name, description: "Descrição do produto de teste.", type: "EBOOK", priceCents: "100,00", currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://area.exemplo.co.mz/membros" });
let S: Scope;
let OTHER: Scope;
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
  OTHER = scopeOf((await testSeller("outra@ntp.local")).id, false);
});

let seq = 0;
async function buyAndPay(slug: string) {
  const r = await submitCheckout(slug, { name: "Ana", email: "ana@exemplo.co.mz", phone: "841234567", method: "mpesa", idempotencyKey: `idem${Date.now()}${seq++}abcdefgh` });
  if (r.kind !== "payment_started") throw new Error(r.kind);
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token }, include: { payments: true } });
  const p = o.payments[0];
  expect(await nextDestination(r.token)).toBeNull(); // sem confirmação não há redirecionamento
  const raw = JSON.stringify({ eventId: `ev_${p.id}_paid`, externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  expect((await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }))).status).toBe(200);
  return r.token;
}

describe("Pixel do Facebook por produto", () => {
  it("o Pixel indicado no produto é criado, ligado ao produto e aparece nas Integrações; o token nunca é devolvido", async () => {
    const a = await createProduct(form("Produto A"), S);
    const b = await createProduct(form("Produto B"), S);
    // Pixel novo sem token: recusado antes de gravar
    expect(await checkProductPixel(S, { pixelId: "123456789012345" })).toHaveProperty("pixelToken");
    expect(await checkProductPixel(S, { pixelId: "abc" })).toHaveProperty("pixelId");
    expect(await checkProductPixel(S, { pixelId: "123456789012345", token: TOKEN })).toBeNull();

    await setProductPixel(S, a.id, { pixelId: "123456789012345", token: TOKEN });
    // o mesmo Pixel noutro produto já não precisa do token
    expect(await checkProductPixel(S, { pixelId: "123456789012345" })).toBeNull();
    await setProductPixel(S, b.id, { pixelId: "123456789012345" });
    let pixels = await listMetaPixels(S);
    expect(pixels).toHaveLength(1);
    expect(pixels[0].productIds.sort()).toEqual([a.id, b.id].sort());
    expect(JSON.stringify(pixels)).not.toContain(TOKEN);
    expect(JSON.stringify(await prisma.metaPixel.findFirstOrThrow())).not.toContain(TOKEN);
    expect(await productPixel(S, a.id)).toEqual({ pixelId: "123456789012345", tokenHint: expect.stringMatching(/^••••/) });

    // produto B com outro Pixel: deixa o primeiro e liga-se ao novo
    await setProductPixel(S, b.id, { pixelId: "999999999999", token: TOKEN });
    pixels = await listMetaPixels(S);
    expect(pixels.find((p) => p.pixelId === "123456789012345")!.productIds).toEqual([a.id]);
    expect(pixels.find((p) => p.pixelId === "999999999999")!.productIds).toEqual([b.id]);
    // campo vazio: o produto deixa de enviar compras ao Pixel (o Pixel fica nas Integrações)
    await setProductPixel(S, a.id, { pixelId: "" });
    expect(await productPixel(S, a.id)).toBeNull();
    expect(await prisma.metaPixel.count()).toBe(2);
    // isolamento: outra conta não liga produtos alheios nem vê os Pixels
    await setProductPixel(OTHER, a.id, { pixelId: "555555555555", token: TOKEN });
    expect(await productPixel(S, a.id)).toBeNull();
    expect(await listMetaPixels(OTHER)).toEqual([]);
  });
});

describe("link de upsell no produto", () => {
  it("cria o funil automaticamente e, só depois do pagamento confirmado, leva o comprador ao link", async () => {
    const p = await createProduct(form("Ebook"), S);
    await publishProduct(p.id, S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PUBLISHED");
    expect(await setProductUpsellUrl(p.id, "https://meusite.co.mz/upsell", S)).toBeNull();
    const product = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(product.mainFunnelId).toBeTruthy();
    const funnel = await prisma.funnel.findUniqueOrThrow({ where: { id: product.mainFunnelId! }, include: { steps: true } });
    expect(funnel.status).toBe("ACTIVE");
    expect(funnel.productId).toBe(p.id);
    expect(funnel.steps.find((s) => s.type === "THANK_YOU")).toMatchObject({ label: UPSELL_STEP_LABEL, config: expect.objectContaining({ useSitePage: false, redirectUrl: "https://meusite.co.mz/upsell" }) });
    expect(await productUpsellUrl(p.id, S)).toBe("https://meusite.co.mz/upsell");

    const t = await buyAndPay(p.primaryCheckout.slug!);
    expect(await nextDestination(t)).toEqual({ kind: "external", url: "https://meusite.co.mz/upsell" });

    // alterar e remover: o mesmo funil é reutilizado (sem duplicados)
    await setProductUpsellUrl(p.id, "https://meusite.co.mz/outra", S);
    expect(await productUpsellUrl(p.id, S)).toBe("https://meusite.co.mz/outra");
    await setProductUpsellUrl(p.id, "", S);
    expect(await productUpsellUrl(p.id, S)).toBe("");
    expect(await prisma.funnel.count({ where: { productId: p.id } })).toBe(1);
    const t2 = await buyAndPay(p.primaryCheckout.slug!);
    expect(await nextDestination(t2)).toEqual({ kind: "thank_you", url: `/obrigado/${t2}` });
  });

  it("produto novo (rascunho) com link: o funil fica ativo e funciona depois de publicar", async () => {
    const p = await createProduct(form("Rascunho com upsell"), S);
    expect(await setProductUpsellUrl(p.id, "https://meusite.co.mz/upsell", S)).toBeNull();
    const product = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { mainFunnel: true } });
    expect(product.mainFunnel?.status).toBe("ACTIVE");
    await publishProduct(p.id, S);
    const t = await buyAndPay(p.primaryCheckout.slug!);
    expect(await nextDestination(t)).toEqual({ kind: "external", url: "https://meusite.co.mz/upsell" });
  });

  it("sem link não cria funil; outra conta não altera o produto", async () => {
    const p = await createProduct(form("Sem upsell"), S);
    expect(await setProductUpsellUrl(p.id, "", S)).toBeNull();
    expect(await prisma.funnel.count()).toBe(0);
    await setProductUpsellUrl(p.id, "https://intruso.example/x", OTHER);
    expect(await prisma.funnel.count()).toBe(0);
  });
});
