// Funis reais: assistente (produto inicial → upsell/obrigado), pós-pagamento, upsell como pedido próprio,
// página de obrigado (PDF/link/WhatsApp) e PDF protegido. Pagamentos pelo fornecedor de TESTE local.
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct } from "@/server/services/products";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { activateWizardFunnel, createWizardFunnel, deactivateWizardFunnel, getWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { acceptUpsell, declineUpsell, getRealOfferView, getThankYouView, nextDestination } from "@/server/services/post-purchase";
import { fileForBuyer, saveProductPdf } from "@/server/services/product-files";
import { defaultThankYouDesign } from "@/lib/thank-you";

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
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");

async function product(name: string, price: string) {
  return createProduct(productSchema.parse({ name, description: `${name} para testes`, type: "EBOOK", priceCents: price, currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://conteudo.exemplo/x" }), false);
}

async function payByWebhook(token: string, state: "paid" | "failed" = "paid") {
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: `ev_${p.id}_${state}`, externalId: p.externalId, reference: p.idempotencyKey, status: state, amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  const r = await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
  expect(r.status).toBe(200);
}

const thankYou = (action: object, fileId: string | null = null) => ({ design: defaultThankYouDesign(), action, fileId });

async function funnelFor(mainName = "Ebook Principal", opts: { upsell?: boolean; action?: object; fileId?: (mainId: string) => Promise<string> } = {}) {
  const main = await product(mainName, "500,00");
  const extra = await product("Curso Extra", "250,00");
  const f = await createWizardFunnel(main.id, false);
  const fileId = opts.fileId ? await opts.fileId(main.id) : null;
  const r = await saveWizardFunnel(
    f.id,
    {
      name: "Funil de teste",
      productId: main.id,
      afterPayment: opts.upsell ? "upsell" : "thank_you",
      upsell: opts.upsell ? { productId: extra.id, offerId: extra.offers[0].id, headline: "Leve também o Curso Extra", afterFail: "thank_you" } : undefined,
      thankYou: thankYou(opts.action ?? { type: "product", delivery: "link", url: "https://area.exemplo.co.mz/membros" }, fileId),
    },
    false,
  );
  expect(r).toMatchObject({ ok: true });
  const v = await activateWizardFunnel(f.id, false);
  expect(v.valid).toBe(true);
  return { main, extra, funnel: f, slug: main.primaryCheckout.slug! };
}

const buy = (slug: string, phone = "841234567") => submitCheckout(slug, { name: "Ana Compradora", email: "ana@exemplo.co.mz", phone, method: "mpesa", idempotencyKey: key() });

describe("1–3. configuração do funil pelo assistente", () => {
  it("cria funil com produto inicial e página de obrigado; ativar associa o checkout já existente do produto", async () => {
    const { main, funnel } = await funnelFor();
    const w = (await getWizardFunnel(funnel.id, false))!;
    expect(w.state).toMatchObject({ productId: main.id, afterPayment: "thank_you", upsell: null, status: "ACTIVE" });
    expect(w.checkout.path).toBe(`/checkout/${main.primaryCheckout.slug}`);
    expect(await prisma.checkout.count({ where: { productId: main.id } })).toBe(1); // nenhum checkout novo
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: main.primaryCheckout.id } })).funnelId).toBe(funnel.id);
  });

  it("cria funil com upsell; valida produto/preço do upsell e o PDF", async () => {
    const { funnel, extra, main } = await funnelFor("Ebook A", { upsell: true });
    const w = (await getWizardFunnel(funnel.id, false))!;
    expect(w.state.afterPayment).toBe("upsell");
    expect(w.state.upsell).toMatchObject({ productId: extra.id, offerId: extra.offers[0].id, headline: "Leve também o Curso Extra" });

    const base = { name: "X", productId: main.id, afterPayment: "upsell", thankYou: thankYou({ type: "product", delivery: "link", url: "https://a.exemplo.co.mz" }) };
    const same = await saveWizardFunnel(funnel.id, { ...base, upsell: { productId: main.id, offerId: main.offers[0].id, headline: "Mesmo produto" } }, false);
    expect(same.ok).toBe(false);
    const wrongOffer = await saveWizardFunnel(funnel.id, { ...base, upsell: { productId: extra.id, offerId: main.offers[0].id, headline: "Preço de outro produto" } }, false);
    expect(wrongOffer.ok).toBe(false);
    const pdfMissing = await saveWizardFunnel(funnel.id, { ...base, afterPayment: "thank_you", thankYou: thankYou({ type: "product", delivery: "pdf" }) }, false);
    expect(pdfMissing.ok).toBe(false);
    const other = await product("Outro", "10,00");
    const foreignPdf = await saveProductPdf(other.id, false, { name: "x.pdf", type: "application/pdf", bytes: PDF });
    const pdfForeign = await saveWizardFunnel(funnel.id, { ...base, afterPayment: "thank_you", thankYou: thankYou({ type: "product", delivery: "pdf" }, foreignPdf.id) }, false);
    expect(pdfForeign.ok).toBe(false);
  });
});

describe("4–7. pós-pagamento e upsell real", () => {
  it("pendente não é aprovado; depois da confirmação segue para o upsell; recusar mantém a compra inicial", async () => {
    const { slug } = await funnelFor("Ebook B", { upsell: true });
    const r = await buy(slug);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    // 5. pendente: sem destino, sem upsell, página de obrigado sem botão
    expect(await nextDestination(r.token)).toBeNull();
    const pending = (await getThankYouView(r.token))!;
    expect(pending.state).toBe("pending");
    expect(pending.button).toBeNull();
    const runBefore = await prisma.funnelRun.count();
    expect(runBefore).toBe(0);

    await payByWebhook(r.token);
    const d = (await nextDestination(r.token))!;
    expect(d.kind).toBe("upsell");
    const runId = d.url.split("/").pop()!;
    // repetir não cria percursos duplicados
    expect(await nextDestination(r.token)).toEqual(d);
    expect(await prisma.funnelRun.count()).toBe(1);

    // 6. recusar
    const dec = (await declineUpsell(runId, "upsell"))!;
    expect(dec).toEqual({ kind: "thank_you", url: `/obrigado/${r.token}` });
    const root = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token }, include: { delivery: true } });
    expect(root.status).toBe("APPROVED");
    expect(root.delivery).not.toBeNull();
    expect(await prisma.order.count()).toBe(1);
    expect(await nextDestination(r.token)).toEqual({ kind: "thank_you", url: `/obrigado/${r.token}` });
    // depois de recusar, a oferta já não pode ser aceite
    expect((await acceptUpsell(runId, "upsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() })).kind).toBe("unavailable");
  });

  it("aceitar cria um pedido próprio com o preço do servidor; só é entregue após confirmação; sem duplicados", async () => {
    const { slug, extra } = await funnelFor("Ebook C", { upsell: true });
    const r = await buy(slug);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    await payByWebhook(r.token);
    const runId = (await nextDestination(r.token))!.url.split("/").pop()!;

    const k = key();
    const a = await acceptUpsell(runId, "upsell", { method: "mpesa", phone: "", idempotencyKey: k }); // número em branco = o da compra inicial
    if (a.kind !== "payment_started") throw new Error(JSON.stringify(a));
    const child = await prisma.order.findUniqueOrThrow({ where: { publicToken: a.token }, include: { items: true, payments: true, delivery: true, parentOrder: true } });
    expect(child).toMatchObject({ status: "PENDING", totalCents: 25000, currency: "MZN", funnelStepKey: "upsell" });
    expect(child.parentOrder?.publicToken).toBe(r.token);
    expect(child.items[0]).toMatchObject({ productId: extra.id, kind: "UPSELL", unitPriceCents: 25000 });
    expect(child.payments[0].phoneMasked).toBe("84•••••67");
    expect(child.delivery).toBeNull(); // clicar em aceitar não paga nada
    expect(await nextDestination(a.token)).toBeNull(); // pendente

    // duplo clique / nova tentativa enquanto pendente: mesma encomenda, sem nova cobrança
    const again = await acceptUpsell(runId, "upsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    expect(again).toMatchObject({ kind: "payment_started", token: a.token });
    expect(await prisma.payment.count({ where: { orderId: child.id } })).toBe(1);

    const tyPending = (await getThankYouView(r.token))!;
    expect(tyPending.upsells[0]).toMatchObject({ status: "PENDING", accessHref: null });

    await payByWebhook(a.token);
    expect(await nextDestination(a.token)).toEqual({ kind: "thank_you", url: `/obrigado/${r.token}` });
    const ty = (await getThankYouView(a.token))!; // o token do upsell mostra a página da compra completa
    expect(ty.state).toBe("confirmed");
    expect(ty.upsells[0].status).toBe("APPROVED");
    expect(ty.upsells[0].accessHref).toMatch(/^\/acesso\//);
    const root = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token } });
    expect(root.totalCents).toBe(50000); // a compra inicial nunca é alterada
  });

  it("7. falha no pagamento do upsell: nada entregue, compra inicial intacta, destino configurado", async () => {
    const { slug } = await funnelFor("Ebook D", { upsell: true });
    const r = await buy(slug);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    await payByWebhook(r.token);
    const runId = (await nextDestination(r.token))!.url.split("/").pop()!;
    // telefone terminado em 0: o fornecedor de teste recusa
    const a = await acceptUpsell(runId, "upsell", { method: "mpesa", phone: "841234560", idempotencyKey: key() });
    if (a.kind !== "payment_started") throw new Error(a.kind);
    const child = await prisma.order.findUniqueOrThrow({ where: { publicToken: a.token }, include: { delivery: true } });
    expect(child.status).toBe("DECLINED");
    expect(child.delivery).toBeNull();
    expect(await nextDestination(a.token)).toEqual({ kind: "thank_you", url: `/obrigado/${r.token}?oferta=nao-paga` });
    expect((await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token } })).status).toBe("APPROVED");
    const ty = (await getThankYouView(r.token))!;
    expect(ty.state).toBe("confirmed");
    expect(ty.upsells[0]).toMatchObject({ status: "DECLINED", accessHref: null });
  });

  it("URL manipulado: oferta de compra não paga fica bloqueada; percurso inexistente não dá nada", async () => {
    const { slug } = await funnelFor("Ebook E", { upsell: true });
    const r = await buy(slug);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    const root = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token } });
    // percurso forjado para uma compra ainda pendente
    await prisma.funnelRun.create({ data: { id: "forjadoabcdef1234", funnelId: root.funnelId!, orderId: root.id, currentStepKey: "upsell", isDemo: false } });
    const v = (await getRealOfferView("forjadoabcdef1234"))!;
    expect(v.blocked).toBe(true);
    expect((await acceptUpsell("forjadoabcdef1234", "upsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() })).kind).toBe("unavailable");
    expect(await getRealOfferView("naoexiste1234567")).toBeNull();
    expect(await getThankYouView("token-invalido-123456789")).toBeNull();
  });

  it("funil sem upsell: após pagamento vai para a página de obrigado; funil desativado deixa de ser usado", async () => {
    const { slug, funnel } = await funnelFor("Ebook F");
    const r = await buy(slug);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    await payByWebhook(r.token);
    expect(await nextDestination(r.token)).toEqual({ kind: "thank_you", url: `/obrigado/${r.token}` });
    await deactivateWizardFunnel(funnel.id, false);
    const r2 = await buy(slug);
    if (r2.kind !== "payment_started") throw new Error(r2.kind);
    await payByWebhook(r2.token);
    expect(await nextDestination(r2.token)).toBeNull();
    expect((await prisma.order.findUniqueOrThrow({ where: { publicToken: r2.token } })).funnelId).toBeNull();
  });
});

describe("8–11. página de obrigado e entrega", () => {
  it("8. WhatsApp: link wa.me com número normalizado e mensagem codificada, só com a compra confirmada", async () => {
    const { slug } = await funnelFor("Ebook G", { action: { type: "whatsapp", phone: "84 123 4567", message: "Olá! Acabei de comprar & preciso de ajuda?" } });
    const r = await buy(slug);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    expect((await getThankYouView(r.token))!.button).toBeNull();
    await payByWebhook(r.token);
    const ty = (await getThankYouView(r.token))!;
    expect(ty.button).toEqual({ label: "Falar connosco no WhatsApp", href: "https://wa.me/258841234567?text=Ol%C3%A1!%20Acabei%20de%20comprar%20%26%20preciso%20de%20ajuda%3F", external: true });
  });

  it("9. link do produto", async () => {
    const { slug } = await funnelFor("Ebook H", { action: { type: "product", delivery: "link", url: "https://area.exemplo.co.mz/curso", buttonText: "Entrar na área" } });
    const r = await buy(slug);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    await payByWebhook(r.token);
    expect((await getThankYouView(r.token))!.button).toEqual({ label: "Entrar na área", href: "https://area.exemplo.co.mz/curso", external: true });
  });

  it("10–11. PDF protegido: só o comprador com a encomenda paga descarrega", async () => {
    let pdfId = "";
    const { slug } = await funnelFor("Ebook PDF", {
      action: { type: "product", delivery: "pdf" },
      fileId: async (mainId) => (pdfId = (await saveProductPdf(mainId, false, { name: "Guia completo.pdf", type: "application/pdf", bytes: PDF })).id),
    });
    await expect(saveProductPdf((await prisma.product.findFirstOrThrow()).id, false, { name: "falso.pdf", type: "application/pdf", bytes: Buffer.from("<html>") })).rejects.toThrow("PDF válido");

    const r = await buy(slug);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    const pendingOrder = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token } });
    // ainda não pago: não há acesso
    const fakeDelivery = await prisma.delivery.create({ data: { orderId: pendingOrder.id, token: "tokendeteste_nao_pago_1234567890ab" } });
    expect(await fileForBuyer(fakeDelivery.token, pdfId)).toBeNull();
    await prisma.delivery.delete({ where: { id: fakeDelivery.id } });

    await payByWebhook(r.token);
    const ty = (await getThankYouView(r.token))!;
    expect(ty.button?.label).toBe("Descarregar o meu produto");
    const [, , dToken, , fId] = ty.button!.href.split("/");
    expect(fId).toBe(pdfId);
    const file = await fileForBuyer(dToken, fId);
    expect(file?.filename).toBe("Guia completo.pdf");
    expect(Buffer.from(file!.data).equals(PDF)).toBe(true);

    // outra compra (outro produto) não dá acesso a este PDF; tokens inventados também não
    const other = await product("Outro produto", "20,00");
    const r2 = await buy(other.primaryCheckout.slug!);
    if (r2.kind !== "payment_started") throw new Error(r2.kind);
    await payByWebhook(r2.token);
    const otherDelivery = await prisma.delivery.findFirstOrThrow({ where: { order: { publicToken: r2.token } } });
    expect(await fileForBuyer(otherDelivery.token, pdfId)).toBeNull();
    expect(await fileForBuyer("x".repeat(32), pdfId)).toBeNull();
    // reembolso revoga o acesso
    await prisma.order.update({ where: { publicToken: r.token }, data: { status: "REFUNDED" } });
    expect(await fileForBuyer(dToken, pdfId)).toBeNull();
  });
});
