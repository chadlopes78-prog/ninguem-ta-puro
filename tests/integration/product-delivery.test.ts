// Entrega do produto (sessão 19): PDF privado ou link de acesso definidos no produto, entrega só depois do
// pagamento confirmado, acesso a todos os produtos pagos (principal, upsell, downsell), área "Os meus produtos",
// recuperação do acesso sem email e isolamento entre contas. Pagamentos pelo fornecedor de TESTE local.
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct, updateProduct } from "@/server/services/products";
import { getReadiness } from "@/server/services/product-readiness";
import { deleteProductFile, fileForBuyer, removeProductDeliveryFile, saveProductPdf, setProductDeliveryFile } from "@/server/services/product-files";
import { createWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { acceptUpsell, getThankYouView, nextDestination } from "@/server/services/post-purchase";
import { getAccessArea, recoverAccess } from "@/server/services/delivery";
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

const PDF = (tag: string) => Buffer.from(`%PDF-1.4\n% ${tag}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF`);
const form = (over: Record<string, unknown> = {}) => productSchema.parse({ name: "Ebook", description: "Descrição do produto de teste.", type: "EBOOK", priceCents: "500,00", currency: "MZN", status: "DRAFT", ...over });
let S: Scope;
let OTHER: Scope;
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
  OTHER = scopeOf((await testSeller("outra@ntp.local")).id, false);
});

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;
async function webhook(token: string, status: "paid" | "failed" = "paid") {
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: `ev_${p.id}_${status}`, externalId: p.externalId, reference: p.idempotencyKey, status, amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  expect((await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }))).status).toBe(200);
}
async function buy(slug: string, email = "ana@exemplo.co.mz") {
  const r = await submitCheckout(slug, { name: "Ana Compradora", email, phone: "841234567", method: "mpesa", idempotencyKey: key() });
  if (r.kind !== "payment_started") throw new Error(r.kind);
  return r.token;
}
const tokenOf = async (publicToken: string) => (await prisma.order.findUniqueOrThrow({ where: { publicToken }, include: { delivery: true } })).delivery?.token ?? null;

async function pdfProduct(scope: Scope, name = "Ebook PDF") {
  const p = await createProduct(form({ name, deliveryMethod: "FILE" }), scope);
  const f = await saveProductPdf(p.id, scope, { name: `${name}.pdf`, type: "application/pdf", bytes: PDF(name) });
  await setProductDeliveryFile(p.id, f.id, scope);
  return { product: p, file: f };
}
async function saasProduct(scope: Scope, name = "App SaaS", url = "https://app.exemplo.co.mz/entrar") {
  return createProduct(form({ name, priceCents: "900,00", deliveryMethod: "EXTERNAL_LINK", accessUrl: url }), scope);
}
const base = { support: { phone: "+258 84 123 4567" } };
async function funnelFor(mainId: string, delivery: Record<string, unknown>, offers: unknown[] = []) {
  const f = await createWizardFunnel(mainId, S);
  const r = await saveWizardFunnel(f.id, { name: "Funil", productId: mainId, offers, thankYou: { design: defaultThankYouDesign(), fileId: null, stepName: "Obrigado", useSitePage: true, redirectUrl: "" }, delivery, ...base }, S);
  expect(r).toMatchObject({ ok: true });
  await publishProduct(mainId, S);
  return f;
}

describe("configuração do entregável", () => {
  it("produto PDF: ficheiro carregado guardado na base de dados (privado), associado ao produto, requisito cumprido", async () => {
    const { product, file } = await pdfProduct(S);
    const row = await prisma.product.findUniqueOrThrow({ where: { id: product.id }, include: { deliveryFile: true } });
    expect(row.deliveryMethod).toBe("FILE");
    expect(row.deliveryFile?.id).toBe(file.id);
    expect(Buffer.from(row.deliveryFile!.data).subarray(0, 5).toString()).toBe("%PDF-");
    const r = await getReadiness(product.id, S);
    expect(r.requirements.find((x) => x.key === "delivery")?.ok).toBe(true);
    expect(r.requirements.find((x) => x.key === "deliveryContent")?.ok).toBe(true);
    // sem ficheiro: incompleto
    const empty = await createProduct(form({ name: "Sem ficheiro", deliveryMethod: "FILE" }), S);
    expect((await getReadiness(empty.id, S)).requirements.find((x) => x.key === "deliveryContent")).toMatchObject({ ok: false, href: `/produtos/${empty.id}#entrega` });
    // só PDFs reais
    await expect(saveProductPdf(product.id, S, { name: "x.pdf", type: "application/pdf", bytes: Buffer.from("isto não é um pdf") })).rejects.toThrow("não é um PDF");
  });

  it("produto SaaS: link de acesso validado e guardado; não exige PDF", async () => {
    const p = await saasProduct(S);
    const row = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(row).toMatchObject({ deliveryMethod: "EXTERNAL_LINK", deliveryUrl: "https://app.exemplo.co.mz/entrar", deliveryFileId: null });
    expect((await getReadiness(p.id, S)).requirements.find((x) => x.key === "deliveryContent")?.ok).toBe(true);
    for (const bad of ["javascript:alert(1)", "app.exemplo", "https://exemplo .com", "ftp://x.y"]) {
      expect(productSchema.safeParse({ ...form(), deliveryMethod: "EXTERNAL_LINK", accessUrl: bad }).success).toBe(false);
    }
    // editar o link
    await updateProduct(p.id, form({ name: "App SaaS", priceCents: "900,00", deliveryMethod: "EXTERNAL_LINK", accessUrl: "https://app.exemplo.co.mz/v2" }), S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).deliveryUrl).toBe("https://app.exemplo.co.mz/v2");
  });

  it("guardar sem a secção de entrega mantém a configuração; substituir e remover o ficheiro", async () => {
    const { product, file } = await pdfProduct(S);
    await updateProduct(product.id, form({ name: "Ebook PDF 2" }), S);
    expect(await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).toMatchObject({ deliveryMethod: "FILE", deliveryFileId: file.id, name: "Ebook PDF 2" });
    const f2 = await saveProductPdf(product.id, S, { name: "v2.pdf", type: "application/pdf", bytes: PDF("v2") });
    await setProductDeliveryFile(product.id, f2.id, S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).deliveryFileId).toBe(f2.id);
    expect(await prisma.productFile.findUnique({ where: { id: file.id } })).toBeNull(); // o anterior deixa de existir
    await removeProductDeliveryFile(product.id, S);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).deliveryFileId).toBeNull();
  });

  it("produto publicado: não fica sem entrega (não remove o ficheiro nem muda para PDF sem ficheiro)", async () => {
    const { product, file } = await pdfProduct(S);
    await funnelFor(product.id, { method: "FILE", fileId: file.id });
    await expect(removeProductDeliveryFile(product.id, S)).rejects.toThrow("produto publicado");
    await expect(deleteProductFile(file.id, S)).rejects.toThrow("produto publicado");
    const saas = await saasProduct(S, "Outro");
    await funnelFor(saas.id, { method: "EXTERNAL_LINK", url: "https://app.exemplo.co.mz/entrar" });
    await expect(updateProduct(saas.id, form({ name: "Outro", priceCents: "900,00", status: "PUBLISHED", deliveryMethod: "FILE" }), S)).rejects.toThrow("carregue o ficheiro");
  });

  it("isolamento: ficheiros e produtos de outra conta não podem ser usados nem descarregados", async () => {
    const mine = await pdfProduct(S, "Meu");
    const theirs = await pdfProduct(OTHER, "Alheio");
    await expect(setProductDeliveryFile(mine.product.id, theirs.file.id, S)).rejects.toThrow("não pertence");
    await expect(setProductDeliveryFile(theirs.product.id, theirs.file.id, S)).rejects.toThrow();
    await expect(saveProductPdf(theirs.product.id, S, { name: "x.pdf", type: "application/pdf", bytes: PDF("x") })).rejects.toThrow();
    await expect(deleteProductFile(theirs.file.id, S)).rejects.toThrow();
  });
});

describe("entrega depois do pagamento", () => {
  it("PDF: nada antes da confirmação; depois, “Descarregar produto” com download validado; sem URL público", async () => {
    const { product, file } = await pdfProduct(S);
    await funnelFor(product.id, { method: "FILE", fileId: file.id });
    const t = await buy(product.primaryCheckout.slug!);
    // pendente: sem acesso
    expect((await getThankYouView(t))!.button).toBeNull();
    expect(await tokenOf(t)).toBeNull();
    await webhook(t);
    await webhook(t); // repetido: sem duplicados
    expect(await prisma.delivery.count()).toBe(1);
    const view = (await getThankYouView(t))!;
    const tok = (await tokenOf(t))!;
    expect(view.button).toMatchObject({ label: "Descarregar produto", href: `/acesso/${tok}/ficheiro/${file.id}`, external: false });
    expect(view.buttonKind).toBe("pdf");
    expect(view.mainProductName).toBe("Ebook PDF");
    expect(view.accessAreaHref).toBe(`/acesso/${tok}`);
    const dl = await fileForBuyer(tok, file.id);
    expect(Buffer.from(dl!.data).toString()).toContain("Ebook PDF");
    // sem o token secreto, ou com um token inventado, não há ficheiro
    expect(await fileForBuyer("x".repeat(32), file.id)).toBeNull();
    // reembolso revoga o acesso
    await prisma.order.update({ where: { publicToken: t }, data: { status: "REFUNDED" } });
    expect(await fileForBuyer(tok, file.id)).toBeNull();
    expect(await getAccessArea(tok)).toBeNull();
  });

  it("um comprador não descarrega o ficheiro de outro produto/conta com o seu próprio acesso", async () => {
    const a = await pdfProduct(S, "Produto A");
    await funnelFor(a.product.id, { method: "FILE", fileId: a.file.id });
    const b = await pdfProduct(OTHER, "Produto B");
    const t = await buy(a.product.primaryCheckout.slug!);
    await webhook(t);
    const tok = (await tokenOf(t))!;
    expect(await fileForBuyer(tok, a.file.id)).not.toBeNull();
    expect(await fileForBuyer(tok, b.file.id)).toBeNull();
  });

  it("principal PDF + upsell SaaS + downsell PDF: cada produto pago com o seu acesso; recusar mantém o principal", async () => {
    const main = await pdfProduct(S, "Ebook Principal");
    const saas = await saasProduct(S, "App Premium");
    const down = await pdfProduct(S, "Guia Essencial");
    await funnelFor(main.product.id, { method: "FILE", fileId: main.file.id }, [
      { key: "upsell", type: "UPSELL", name: "Upsell SaaS", productId: saas.id, onDecline: "downsell" },
      { key: "downsell", type: "DOWNSELL", name: "Downsell PDF", productId: down.product.id },
    ]);

    // A) recusa tudo: mantém o ebook
    const t1 = await buy(main.product.primaryCheckout.slug!);
    await webhook(t1);
    const run1 = (await nextDestination(t1))!.url.split("/").pop()!;
    const { declineUpsell } = await import("@/server/services/post-purchase");
    await declineUpsell(run1, "upsell");
    await declineUpsell(run1, "downsell");
    const area1 = (await getAccessArea((await tokenOf(t1))!))!;
    expect(area1.products.map((p) => [p.name, p.action?.label])).toEqual([["Ebook Principal", "Descarregar produto"]]);

    // B) aceita o upsell (SaaS): pendente → não aparece; pago → aparece com o link
    const t2 = await buy(main.product.primaryCheckout.slug!);
    await webhook(t2);
    const run2 = (await nextDestination(t2))!.url.split("/").pop()!;
    const acc = await acceptUpsell(run2, "upsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (acc.kind !== "payment_started") throw new Error(acc.kind);
    const rootTok = (await tokenOf(t2))!;
    expect((await getAccessArea(rootTok))!.products).toHaveLength(1);
    expect((await getThankYouView(t2))!.extraProducts).toEqual([]);
    await webhook(acc.token);
    const area2 = (await getAccessArea(rootTok))!;
    expect(area2.products.map((p) => [p.kind, p.name, p.action?.label, p.action?.href])).toEqual([
      ["MAIN", "Ebook Principal", "Descarregar produto", `/acesso/${rootTok}/ficheiro/${main.file.id}`],
      ["UPSELL", "App Premium", "Aceder ao meu produto", "https://app.exemplo.co.mz/entrar"],
    ]);
    expect((await getThankYouView(t2))!.extraProducts).toEqual([{ name: "App Premium", kind: "UPSELL", label: "Aceder ao meu produto", href: "https://app.exemplo.co.mz/entrar", external: true, file: false }]);
    // o acesso do upsell (token próprio) também abre a área completa da compra
    expect((await getAccessArea((await tokenOf(acc.token))!))!.products).toHaveLength(2);
    // vendas: uma principal + uma de upsell, sem duplicados
    expect(await prisma.order.count({ where: { OR: [{ publicToken: t2 }, { parentOrder: { publicToken: t2 } }] } })).toBe(2);

    // C) recusa o upsell e compra o downsell (PDF): descarrega com o token da encomenda do downsell
    const t3 = await buy(main.product.primaryCheckout.slug!);
    await webhook(t3);
    const run3 = (await nextDestination(t3))!.url.split("/").pop()!;
    await declineUpsell(run3, "upsell");
    const accD = await acceptUpsell(run3, "downsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (accD.kind !== "payment_started") throw new Error(accD.kind);
    await webhook(accD.token);
    const downTok = (await tokenOf(accD.token))!;
    const area3 = (await getAccessArea((await tokenOf(t3))!))!;
    expect(area3.products.map((p) => [p.kind, p.name, p.action?.href])).toEqual([
      ["MAIN", "Ebook Principal", `/acesso/${(await tokenOf(t3))!}/ficheiro/${main.file.id}`],
      ["DOWNSELL", "Guia Essencial", `/acesso/${downTok}/ficheiro/${down.file.id}`],
    ]);
    expect(await fileForBuyer(downTok, down.file.id)).not.toBeNull();
    // o token da compra principal não dá o ficheiro do downsell (cada download valida a encomenda que o pagou)
    expect(await fileForBuyer((await tokenOf(t3))!, down.file.id)).toBeNull();
  });
});

describe("recuperação do acesso", () => {
  it("email + código ou email + telemóvel; só compras confirmadas; dados errados não revelam nada", async () => {
    const { product, file } = await pdfProduct(S);
    await funnelFor(product.id, { method: "FILE", fileId: file.id });
    const paid = await buy(product.primaryCheckout.slug!, "Comprador@Exemplo.co.mz");
    await webhook(paid);
    const pending = await buy(product.primaryCheckout.slug!, "comprador@exemplo.co.mz");
    const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: paid } });
    const tok = (await tokenOf(paid))!;
    const byCode = await recoverAccess({ email: "comprador@exemplo.co.mz", code: order.code.toLowerCase() });
    expect(byCode.map((r) => r.href)).toEqual([`/acesso/${tok}`]);
    expect(byCode[0].products).toEqual(["Ebook PDF"]);
    const byPhone = await recoverAccess({ email: "COMPRADOR@exemplo.co.mz", phone: "+258 84 123 4567" });
    expect(byPhone.map((r) => r.href)).toEqual([`/acesso/${tok}`]); // a compra pendente não aparece
    expect(await prisma.order.count({ where: { publicToken: pending, status: "PENDING" } })).toBe(1);
    expect(await recoverAccess({ email: "comprador@exemplo.co.mz", code: "NTP-ERRADO1" })).toEqual([]);
    expect(await recoverAccess({ email: "outra@exemplo.co.mz", code: order.code })).toEqual([]);
    expect(await recoverAccess({ email: "comprador@exemplo.co.mz", phone: "849999999" })).toEqual([]);
    expect(await recoverAccess({ email: "comprador@exemplo.co.mz" })).toEqual([]);
  });
});
