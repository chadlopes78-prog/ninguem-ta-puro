// Destino depois da compra (sessão 29): upsell → link de acesso → página de obrigado com PDF → obrigado padrão.
// Só com pagamento CONFIRMADO pelo processador (notificação assinada do fornecedor de TESTE local).
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct } from "@/server/services/products";
import { saveProductPdf, setProductDeliveryFile, fileForBuyer } from "@/server/services/product-files";
import { setProductUpsellUrl } from "@/server/services/product-upsell";
import { finalDestination } from "@/server/services/post-purchase";
import { getAccessArea } from "@/server/services/delivery";
import { getPaymentView } from "@/server/services/payment-flow";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
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
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
});

const ACCESS = "https://area.exemplo.co.mz/membros";
const UPSELL = "https://meusite.co.mz/oferta-especial";

async function linkProduct(name: string) {
  const p = await createProduct(productSchema.parse({ name, description: "Descrição do produto de teste.", type: "DIGITAL", priceCents: "150,00", currency: "MZN", status: "DRAFT", deliveryMethod: "EXTERNAL_LINK", accessUrl: ACCESS }), S);
  await publishProduct(p.id, S);
  return p;
}
async function pdfProduct(name: string) {
  const p = await createProduct(productSchema.parse({ name, description: "Guia em PDF entregue depois do pagamento.", type: "PDF", priceCents: "90,00", currency: "MZN", status: "DRAFT" }), S);
  const f = await saveProductPdf(p.id, S, { name: "guia.pdf", type: "application/pdf", bytes: Buffer.from("%PDF-1.4\n%teste\n") });
  await setProductDeliveryFile(p.id, f.id, S);
  await prisma.product.update({ where: { id: p.id }, data: { deliveryMethod: "FILE" } }); // «Entrega: ficheiro» no formulário
  await publishProduct(p.id, S);
  return p;
}

let seq = 0;
async function buy(slug: string) {
  const r = await submitCheckout(slug, { name: "Ana", email: `ana${seq}@exemplo.co.mz`, phone: "841234567", method: "mpesa", idempotencyKey: `idem${Date.now()}${seq++}abcdefgh` });
  if (r.kind !== "payment_started") throw new Error(r.kind);
  return r.token;
}
async function notify(token: string, status: "paid" | "failed" | "canceled") {
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: `ev_${p.id}_${status}`, externalId: p.externalId, reference: p.idempotencyKey, status, amountCents: status === "paid" ? p.amountCents : null, currency: "MZN", feeCents: 0 });
  expect((await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }))).status).toBe(200);
}
const accessToken = async (token: string) => (await getPaymentView(token))!.accessToken!;

describe("destino depois do pagamento", () => {
  it("TESTE 1: produto com upsell e link de acesso → upsell", async () => {
    const p = await linkProduct("Curso com upsell");
    expect(await setProductUpsellUrl(p.id, UPSELL, S)).toBeNull();
    const t = await buy(p.primaryCheckout.slug!);
    await notify(t, "paid");
    expect(await finalDestination(t)).toEqual({ kind: "external", url: UPSELL });
  });

  it("TESTE 2: sem upsell, com link de acesso → diretamente para o link de acesso", async () => {
    const p = await linkProduct("Área de membros");
    const t = await buy(p.primaryCheckout.slug!);
    await notify(t, "paid");
    expect(await finalDestination(t)).toEqual({ kind: "external", url: ACCESS });
  });

  it("TESTE 3: PDF sem upsell → página de obrigado com o botão para baixar o PDF (só para a compra paga)", async () => {
    const p = await pdfProduct("Guia PDF");
    const t = await buy(p.primaryCheckout.slug!);
    await notify(t, "paid");
    // sem destino externo: a página de pagamento encaminha para a página de obrigado/acesso da plataforma
    expect(await finalDestination(t)).toBeNull();
    const area = await getAccessArea(await accessToken(t));
    expect(area!.products).toHaveLength(1);
    expect(area!.products[0].action).toMatchObject({ kind: "file" });
    // o download só funciona com o acesso desta compra paga
    const fileId = area!.products[0].action!.href.split("/").pop()!;
    expect(await fileForBuyer(await accessToken(t), fileId)).not.toBeNull();
    expect(await fileForBuyer("token-inventado-0000000000000", fileId)).toBeNull();
  });

  it("TESTE 4: PDF com upsell → primeiro o upsell", async () => {
    const p = await pdfProduct("Guia PDF com upsell");
    await setProductUpsellUrl(p.id, UPSELL, S);
    const t = await buy(p.primaryCheckout.slug!);
    await notify(t, "paid");
    expect(await finalDestination(t)).toEqual({ kind: "external", url: UPSELL });
  });

  it("TESTE 5: pagamento cancelado → sem upsell, sem link de acesso e sem produto", async () => {
    const p = await linkProduct("Cancelado");
    await setProductUpsellUrl(p.id, UPSELL, S);
    const t = await buy(p.primaryCheckout.slug!);
    await notify(t, "canceled");
    expect(await finalDestination(t)).toBeNull();
    expect((await getPaymentView(t))!.accessToken).toBeNull();
    expect(await prisma.delivery.count()).toBe(0);
  });

  it("TESTE 6: pagamento pendente → aguarda (nenhum destino, nenhum acesso)", async () => {
    const p = await linkProduct("Pendente");
    await setProductUpsellUrl(p.id, UPSELL, S);
    const t = await buy(p.primaryCheckout.slug!);
    expect(await finalDestination(t)).toBeNull();
    expect((await getPaymentView(t))!.state).toBe("pending");
    expect((await getPaymentView(t))!.accessToken).toBeNull();
  });

  it("TESTE 7: pagamento aprovado → regra aplicada uma única vez, sem vendas duplicadas", async () => {
    const p = await linkProduct("Aprovado");
    const t = await buy(p.primaryCheckout.slug!);
    await notify(t, "paid");
    await notify(t, "paid"); // aviso repetido
    expect(await prisma.order.count({ where: { status: "APPROVED" } })).toBe(1);
    expect(await finalDestination(t)).toEqual({ kind: "external", url: ACCESS });
    // token inventado ou alterado nunca devolve destino
    expect(await finalDestination("token-inventado-0000000000000")).toBeNull();
  });
});
