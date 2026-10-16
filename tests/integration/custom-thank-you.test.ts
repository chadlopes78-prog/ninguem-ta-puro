// Página de obrigado personalizada (sessão 21): rascunho/publicação/restauro, ligada à entrega real dos produtos
// pagos, com e sem funil (upsell/downsell inalterados), sem alterar produtos/preços, isolada por conta.
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct } from "@/server/services/products";
import { saveProductPdf, setProductDeliveryFile } from "@/server/services/product-files";
import { getThankYouEditorState, publishThankYou, resetThankYou, saveThankYouDraft } from "@/server/services/thank-you-custom";
import { createWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { acceptUpsell, declineUpsell, getThankYouView, hasCustomThankYou, nextDestination } from "@/server/services/post-purchase";
import { getPaymentView } from "@/server/services/payment-flow";
import { saveMedia } from "@/server/services/media";
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

const PDF = Buffer.from("%PDF-1.4\n% obrigado\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const form = (over: Record<string, unknown> = {}) => productSchema.parse({ name: "Ebook", description: "Descrição do produto de teste.", type: "EBOOK", priceCents: "500,00", currency: "MZN", status: "DRAFT", ...over });
const CUSTOM = { name: "Obrigado Ebook", title: "Obrigado pela tua compra!", message: "A tua compra foi confirmada. Já podes aceder ao teu produto.", buttonText: "QUERO O MEU EBOOK", primaryColor: "#FF5500", backgroundColor: "#101820", titleSize: "lg" };
let S: Scope;
let OTHER: Scope;
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
  OTHER = scopeOf((await testSeller("outra@ntp.local")).id, false);
});

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;
async function webhook(token: string) {
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: `ev_${p.id}_paid`, externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  expect((await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }))).status).toBe(200);
}
async function buy(slug: string) {
  const r = await submitCheckout(slug, { name: "Ana", email: "ana@exemplo.co.mz", phone: "841234567", method: "mpesa", idempotencyKey: key() });
  if (r.kind !== "payment_started") throw new Error(r.kind);
  return r.token;
}
async function pdfProduct(scope = S, name = "Ebook PDF") {
  const p = await createProduct(form({ name, deliveryMethod: "FILE" }), scope);
  const f = await saveProductPdf(p.id, scope, { name: "ebook.pdf", type: "application/pdf", bytes: PDF });
  await setProductDeliveryFile(p.id, f.id, scope);
  await publishProduct(p.id, scope);
  return { p, f };
}

describe("página de obrigado personalizada", () => {
  it("rascunho não aparece; publicar aplica título, mensagem, botão e cores; o botão leva ao ficheiro pago", async () => {
    const { p, f } = await pdfProduct();
    expect((await getThankYouEditorState(p.id, S)).status).toBe("default");
    expect(await saveThankYouDraft(p.id, CUSTOM, S)).toEqual({ ok: true });
    expect((await getThankYouEditorState(p.id, S)).status).toBe("unpublished_changes");
    const t1 = await buy(p.primaryCheckout.slug!);
    await webhook(t1);
    // rascunho: os compradores continuam a ver a página padrão; sem funil vão para a página de acesso
    expect(await hasCustomThankYou(t1)).toBe(false);
    expect((await getThankYouView(t1))!.design.title).not.toBe(CUSTOM.title);

    expect(await publishThankYou(p.id, CUSTOM, S)).toEqual({ ok: true });
    expect((await getThankYouEditorState(p.id, S)).status).toBe("published");
    expect(await hasCustomThankYou(t1)).toBe(true);
    const v = (await getThankYouView(t1))!;
    expect(v.customized).toBe(true);
    expect(v.design).toMatchObject({ title: CUSTOM.title, message: CUSTOM.message, primaryColor: "#FF5500", backgroundColor: "#101820" });
    expect(v.titleSize).toBe("lg");
    const tok = (await getPaymentView(t1))!.accessToken!;
    expect(v.button).toEqual({ label: "QUERO O MEU EBOOK", href: `/acesso/${tok}/ficheiro/${f.id}`, external: false });
    // o produto (nome, preço) não muda
    const prod = await prisma.product.findUniqueOrThrow({ where: { id: p.id }, include: { offers: true } });
    expect(prod.name).toBe("Ebook PDF");
    expect(prod.offers[0].priceCents).toBe(50000);
  });

  it("pagamento por confirmar: a página personalizada não dá acesso", async () => {
    const { p } = await pdfProduct();
    await publishThankYou(p.id, CUSTOM, S);
    const t = await buy(p.primaryCheckout.slug!);
    const v = (await getThankYouView(t))!;
    expect(v.state).toBe("pending");
    expect(v.button).toBeNull();
    expect(v.extraProducts).toEqual([]);
  });

  it("SaaS: o botão personalizado abre o link de acesso do produto", async () => {
    const p = await createProduct(form({ name: "App", deliveryMethod: "EXTERNAL_LINK", accessUrl: "https://app.exemplo.co.mz/entrar" }), S);
    await publishProduct(p.id, S);
    await publishThankYou(p.id, { ...CUSTOM, buttonText: "ENTRAR NA APP" }, S);
    const t = await buy(p.primaryCheckout.slug!);
    await webhook(t);
    expect((await getThankYouView(t))!.button).toEqual({ label: "ENTRAR NA APP", href: "https://app.exemplo.co.mz/entrar", external: true });
  });

  it("restaurar padrão remove a personalização (rascunho e publicada)", async () => {
    const { p } = await pdfProduct();
    await publishThankYou(p.id, CUSTOM, S);
    await resetThankYou(p.id, S);
    expect((await getThankYouEditorState(p.id, S)).status).toBe("default");
    expect(await prisma.checkoutThankYou.count()).toBe(0);
  });

  it("validação e isolamento: campos inválidos, imagem de outra conta e produto de outra conta recusados", async () => {
    const { p } = await pdfProduct();
    const bad = await saveThankYouDraft(p.id, { ...CUSTOM, title: "", primaryColor: "vermelho", buttonText: "" }, S);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.fieldErrors)).toEqual(expect.arrayContaining(["title", "primaryColor", "buttonText"]));
    expect((await saveThankYouDraft(p.id, { ...CUSTOM, bannerUrl: "javascript:alert(1)" }, S)).ok).toBe(false);
    const foreign = await saveMedia(OTHER.ownerId, { name: "x.png", bytes: Buffer.concat([PNG, Buffer.from([1])]) });
    await expect(saveThankYouDraft(p.id, { ...CUSTOM, bannerUrl: foreign.url }, S)).rejects.toThrow("não pertence");
    const mine = await saveMedia(S.ownerId, { name: "banner.png", bytes: Buffer.concat([PNG, Buffer.from([2])]) });
    expect(await saveThankYouDraft(p.id, { ...CUSTOM, bannerUrl: mine.url }, S)).toEqual({ ok: true });
    await expect(publishThankYou(p.id, CUSTOM, OTHER)).rejects.toThrow();
    await expect(getThankYouEditorState(p.id, OTHER)).rejects.toThrow();
  });

  it("com funil: upsell/downsell seguem o fluxo e a página final usa a personalização com todos os produtos pagos", async () => {
    const main = await createProduct(form({ name: "Principal", deliveryMethod: "FILE" }), S);
    const f = await saveProductPdf(main.id, S, { name: "p.pdf", type: "application/pdf", bytes: PDF });
    await setProductDeliveryFile(main.id, f.id, S);
    const up = await createProduct(form({ name: "Curso", priceCents: "900,00", deliveryMethod: "EXTERNAL_LINK", accessUrl: "https://curso.exemplo.co.mz" }), S);
    const down = await createProduct(form({ name: "Mini", priceCents: "200,00", deliveryMethod: "EXTERNAL_LINK", accessUrl: "https://mini.exemplo.co.mz" }), S);
    const funnel = await createWizardFunnel(main.id, S);
    expect(
      await saveWizardFunnel(
        funnel.id,
        {
          name: "Funil",
          productId: main.id,
          offers: [
            { key: "upsell", type: "UPSELL", name: "Upsell", productId: up.id, onDecline: "downsell" },
            { key: "downsell", type: "DOWNSELL", name: "Downsell", productId: down.id },
          ],
          thankYou: { design: defaultThankYouDesign({ title: "Título do funil" }), fileId: null, stepName: "Obrigado", useSitePage: true, redirectUrl: "" },
          delivery: { method: "FILE", fileId: f.id },
        },
        S,
      ),
    ).toMatchObject({ ok: true });
    await publishProduct(main.id, S);
    // sem personalização: a página do funil
    const t0 = await buy(main.primaryCheckout.slug!);
    await webhook(t0);
    expect((await getThankYouView(t0))!.design.title).toBe("Título do funil");

    await publishThankYou(main.id, CUSTOM, S);
    const t = await buy(main.primaryCheckout.slug!);
    await webhook(t);
    const d = (await nextDestination(t))!;
    expect(d.kind).toBe("upsell"); // o funil continua a decidir o percurso
    const run = d.url.split("/").pop()!;
    expect(await declineUpsell(run, "upsell")).toEqual({ kind: "upsell", url: `/oferta/${run}` });
    const acc = await acceptUpsell(run, "downsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (acc.kind !== "payment_started") throw new Error(acc.kind);
    await webhook(acc.token);
    expect(await nextDestination(acc.token)).toEqual({ kind: "thank_you", url: `/obrigado/${t}` });
    const v = (await getThankYouView(t))!;
    expect(v.design.title).toBe(CUSTOM.title);
    expect(v.button?.label).toBe("QUERO O MEU EBOOK");
    expect(v.extraProducts).toEqual([expect.objectContaining({ name: "Mini", kind: "DOWNSELL", href: "https://mini.exemplo.co.mz" })]);
    // a página do funil não foi apagada
    expect(await prisma.thankYouPage.count({ where: { funnelId: funnel.id } })).toBe(1);
  });
});
