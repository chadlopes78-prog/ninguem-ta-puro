// Formulário de produto simplificado (imagem carregada, sem preço de referência/página de vendas/ofertas) e
// ofertas centralizadas nos funis (preço criado no funil, upsell + downsell pelo motor de funis existente).
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct, updateProduct } from "@/server/services/products";
import { deleteMedia, saveMedia } from "@/server/services/media";
import { createWizardFunnel, getWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { acceptUpsell, declineUpsell, nextDestination } from "@/server/services/post-purchase";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { defaultThankYouDesign } from "@/lib/thank-you";
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

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = () => Buffer.concat([PNG, Buffer.from([Math.floor(Math.random() * 255)])]);
const form = (over: Record<string, unknown> = {}) => productSchema.parse({ name: "Guia Visual", description: "Descrição do guia visual de teste.", type: "EBOOK", priceCents: "100,00", currency: "MZN", status: "DRAFT", ...over });

let S: Scope;
let OTHER: Scope;
let ownerId: string;
beforeEach(async () => {
  await resetTestDb();
  const a = await testOwner();
  ownerId = a.id;
  S = scopeOf(a.id, false);
  OTHER = scopeOf((await testSeller("outra@ntp.local")).id, false);
});

describe("imagem do produto carregada do dispositivo", () => {
  it("cria, substitui e remove a imagem; fica guardada (não é uma pré-visualização temporária)", async () => {
    const img1 = await saveMedia(ownerId, { name: "capa.png", bytes: png() });
    const p = await createProduct(form({ imageUrl: img1.url }), S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).imageUrl).toBe(`/api/public/media/${img1.id}`);
    const img2 = await saveMedia(ownerId, { name: "nova.png", bytes: png() });
    await updateProduct(p.id, form({ imageUrl: img2.url }), S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).imageUrl).toBe(img2.url);
    await updateProduct(p.id, form({ imageUrl: "" }), S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).imageUrl).toBeNull();
  });

  it("não aceita imagens de outra conta, caminhos forjados nem esquemas perigosos", async () => {
    const foreign = await saveMedia(OTHER.ownerId, { name: "alheia.png", bytes: png() });
    await expect(createProduct(form({ imageUrl: foreign.url }), S)).rejects.toThrow("não pertence a esta conta");
    for (const bad of ["javascript:alert(1)", "/api/public/media/../../etc", "/qualquer/coisa", "data:image/png;base64,AAAA"]) {
      expect(productSchema.safeParse({ ...form(), imageUrl: bad }).success).toBe(false);
    }
  });

  it("produtos antigos com URL continuam a funcionar e o URL mantém-se ao guardar", async () => {
    const legacy = "https://cdn.exemplo.co.mz/capa-antiga.jpg";
    const p = await createProduct(form({ imageUrl: legacy }), S);
    await updateProduct(p.id, form({ imageUrl: legacy, name: "Guia Visual 2" }), S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).imageUrl).toBe(legacy);
  });

  it("a foto de um produto não pode ser apagada da biblioteca (nem por outra conta)", async () => {
    const img = await saveMedia(ownerId, { name: "capa.png", bytes: png() });
    await createProduct(form({ imageUrl: img.url }), S);
    await expect(deleteMedia(ownerId, img.id)).rejects.toThrow("foto do produto");
    await expect(deleteMedia(OTHER.ownerId, img.id)).rejects.toThrow();
  });
});

describe("campos retirados do formulário: os valores guardados mantêm-se", () => {
  it("preço de referência e página de vendas não são apagados ao guardar sem esses campos", async () => {
    const p = await createProduct(form({ priceCents: "100,00", compareAtCents: "150,00", salesPageUrl: "https://vendas.exemplo.co.mz" }), S);
    await updateProduct(p.id, form({ name: "Novo nome", priceCents: "120,00" }), S); // o novo formulário não envia esses campos
    const after = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { offers: true } });
    expect(after.salesPageUrl).toBe("https://vendas.exemplo.co.mz");
    expect(after.offers[0]).toMatchObject({ priceCents: 12000, compareAtCents: 15000 });
    // preço principal acima do preço riscado: o preço riscado deixaria de fazer sentido e é limpo
    await updateProduct(p.id, form({ priceCents: "200,00" }), S);
    expect((await prisma.offer.findFirstOrThrow({ where: { productId: p.id, isDefault: true } })).compareAtCents).toBeNull();
  });

  it("ofertas existentes do produto não são apagadas ao editar o produto", async () => {
    const p = await createProduct(form(), S);
    await prisma.offer.create({ data: { productId: p.id, name: "Oferta upsell", priceCents: 5000, currency: "MZN" } });
    await updateProduct(p.id, form({ name: "Editado" }), S);
    expect(await prisma.offer.count({ where: { productId: p.id } })).toBe(2);
  });
});

// ───────────── funis: upsell + downsell ─────────────

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;
async function pay(token: string) {
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: `ev_${p.id}_paid`, externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  expect((await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }))).status).toBe(200);
}

async function funnelWithDownsell() {
  const main = await createProduct(form({ name: "Ebook Principal", priceCents: "500,00" }), S);
  const extra = await createProduct(form({ name: "Curso Completo", priceCents: "900,00" }), S);
  const cheaper = await prisma.offer.create({ data: { productId: extra.id, name: "Só o módulo 1", priceCents: 30000, currency: "MZN" } });
  const f = await createWizardFunnel(main.id, S);
  const payload = {
    name: "Funil com downsell",
    productId: main.id,
    afterPayment: "upsell",
    upsell: { productId: extra.id, offerId: extra.offers[0].id, headline: "Leve o curso completo", afterDecline: "downsell" },
    downsell: { productId: extra.id, offerId: cheaper.id, headline: "Que tal só o módulo 1?" },
    thankYou: { design: defaultThankYouDesign(), fileId: null },
    support: { phone: "+258 84 123 4567" },
    delivery: { method: "EXTERNAL_LINK", url: "https://area.exemplo.co.mz/membros" },
  };
  const r = await saveWizardFunnel(f.id, payload, S);
  expect(r).toMatchObject({ ok: true });
  await publishProduct(main.id, S);
  return { main, extra, cheaper, funnel: f, payload };
}

describe("ofertas centralizadas nos funis", () => {
  it("funil com upsell e downsell: grafo com a etapa DOWNSELL ligada à recusa do upsell; reabrir mostra a configuração", async () => {
    const { funnel, cheaper } = await funnelWithDownsell();
    const steps = await prisma.funnelStep.findMany({ where: { funnelId: funnel.id } });
    expect(steps.map((s) => s.type).sort()).toEqual(["CHECKOUT", "DOWNSELL", "END", "START", "THANK_YOU", "UPSELL"].sort());
    const edges = await prisma.funnelEdge.findMany({ where: { funnelId: funnel.id } });
    const up = steps.find((s) => s.type === "UPSELL")!;
    const down = steps.find((s) => s.type === "DOWNSELL")!;
    expect(edges.find((e) => e.sourceKey === up.key && e.sourceHandle === "decline")?.targetKey).toBe(down.key);
    const w = (await getWizardFunnel(funnel.id, S))!;
    expect(w.state.upsell?.afterDecline).toBe("downsell");
    expect(w.state.downsell).toMatchObject({ offerId: cheaper.id, headline: "Que tal só o módulo 1?" });
  });

  it("validação: downsell obrigatório quando escolhido; preço de outra conta recusado", async () => {
    const { funnel, payload } = await funnelWithDownsell();
    expect((await saveWizardFunnel(funnel.id, { ...payload, downsell: undefined }, S)).ok).toBe(false);
    const foreign = await createProduct(form({ name: "Alheio" }), OTHER);
    const r = await saveWizardFunnel(funnel.id, { ...payload, downsell: { productId: foreign.id, offerId: foreign.offers[0].id, headline: "Oferta alheia" } }, S);
    expect(r).toMatchObject({ ok: false });
  });

  it("compra real (fornecedor de teste): recusar o upsell mostra o downsell; aceitar o downsell cobra o preço do downsell", async () => {
    const { main, cheaper } = await funnelWithDownsell();
    const buy = await submitCheckout(main.primaryCheckout.slug!, { name: "Ana", email: "ana@exemplo.co.mz", phone: "841234567", method: "mpesa", idempotencyKey: key() });
    if (buy.kind !== "payment_started") throw new Error(buy.kind);
    await pay(buy.token);
    const d = (await nextDestination(buy.token))!;
    expect(d.kind).toBe("upsell");
    const runId = d.url.split("/").pop()!;
    // recusar o upsell → o comprador segue para o downsell (antes ia para a página de obrigado)
    expect(await declineUpsell(runId, "upsell")).toEqual({ kind: "upsell", url: `/oferta/${runId}` });
    expect((await prisma.funnelRun.findUniqueOrThrow({ where: { id: runId } })).currentStepKey).toBe("downsell");
    // aceitar o downsell: nova encomenda com o preço do downsell, registada como DOWNSELL
    const acc = await acceptUpsell(runId, "downsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (acc.kind !== "payment_started") throw new Error(acc.kind);
    const child = await prisma.order.findUniqueOrThrow({ where: { publicToken: acc.token }, include: { items: true } });
    expect(child.totalCents).toBe(30000);
    expect(child.items[0]).toMatchObject({ offerId: cheaper.id, kind: "DOWNSELL" });
    await pay(acc.token);
    expect(await nextDestination(acc.token)).toEqual({ kind: "thank_you", url: `/obrigado/${buy.token}` });
    const run = await prisma.funnelRun.findUniqueOrThrow({ where: { id: runId } });
    expect(run.completedAt).not.toBeNull();
    // compra inicial intacta
    expect((await prisma.order.findUniqueOrThrow({ where: { publicToken: buy.token } })).status).toBe("APPROVED");
  });

  it("recusar também o downsell leva à página de obrigado; funis só com upsell continuam iguais", async () => {
    const { main, funnel, payload } = await funnelWithDownsell();
    const buy = await submitCheckout(main.primaryCheckout.slug!, { name: "Rui", email: "rui@exemplo.co.mz", phone: "841234567", method: "mpesa", idempotencyKey: key() });
    if (buy.kind !== "payment_started") throw new Error(buy.kind);
    await pay(buy.token);
    const runId = (await nextDestination(buy.token))!.url.split("/").pop()!;
    await declineUpsell(runId, "upsell");
    expect(await declineUpsell(runId, "downsell")).toEqual({ kind: "thank_you", url: `/obrigado/${buy.token}` });
    expect(await prisma.order.count()).toBe(1);

    // sem downsell: recusar o upsell vai direto à página de obrigado (comportamento anterior)
    expect((await saveWizardFunnel(funnel.id, { ...payload, upsell: { ...payload.upsell, afterDecline: "thank_you" }, downsell: undefined }, S)).ok).toBe(true);
    expect(await prisma.funnelStep.count({ where: { funnelId: funnel.id, type: "DOWNSELL" } })).toBe(0);
    const buy2 = await submitCheckout(main.primaryCheckout.slug!, { name: "Eva", email: "eva@exemplo.co.mz", phone: "841234567", method: "mpesa", idempotencyKey: key() });
    if (buy2.kind !== "payment_started") throw new Error(buy2.kind);
    await pay(buy2.token);
    const run2 = (await nextDestination(buy2.token))!.url.split("/").pop()!;
    expect(await declineUpsell(run2, "upsell")).toEqual({ kind: "thank_you", url: `/obrigado/${buy2.token}` });
  });
});
