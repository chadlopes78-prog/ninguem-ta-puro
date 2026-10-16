// Modo simples (sessão 20): produto → publicar → pagamento confirmado → acesso ao produto, sem funil,
// sem página de obrigado e sem WhatsApp. O modo com funil (upsell/downsell) continua igual.
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct } from "@/server/services/products";
import { getReadiness } from "@/server/services/product-readiness";
import { fileForBuyer, saveProductPdf, setProductDeliveryFile } from "@/server/services/product-files";
import { createWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { acceptUpsell, declineUpsell, getThankYouView, nextDestination } from "@/server/services/post-purchase";
import { getAccessArea } from "@/server/services/delivery";
import { getPaymentView } from "@/server/services/payment-flow";
import { submitCheckout } from "@/server/services/purchase";
import { getPublicCheckout } from "@/server/services/checkouts";
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

const PDF = Buffer.from("%PDF-1.4\n% simples\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const form = (over: Record<string, unknown> = {}) => productSchema.parse({ name: "Ebook", description: "Descrição do produto de teste.", type: "EBOOK", priceCents: "500,00", currency: "MZN", status: "DRAFT", ...over });
let S: Scope;
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
});

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;
async function webhook(token: string, status: "paid" | "failed" = "paid") {
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: `ev_${p.id}_${status}`, externalId: p.externalId, reference: p.idempotencyKey, status, amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  expect((await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }))).status).toBe(200);
}
async function buy(slug: string) {
  const r = await submitCheckout(slug, { name: "Ana", email: "ana@exemplo.co.mz", phone: "841234567", method: "mpesa", idempotencyKey: key() });
  if (r.kind !== "payment_started") throw new Error(r.kind);
  return r.token;
}
async function pdfProduct(name = "Ebook PDF") {
  const p = await createProduct(form({ name, deliveryMethod: "FILE" }), S);
  const f = await saveProductPdf(p.id, S, { name: `${name}.pdf`, type: "application/pdf", bytes: PDF });
  await setProductDeliveryFile(p.id, f.id, S);
  return { p, f };
}

describe("modo simples (sem funil)", () => {
  it("1–2, 9. produto PDF sem funil, sem obrigado e sem WhatsApp publica; só os requisitos essenciais", async () => {
    const { p } = await pdfProduct();
    const r = await getReadiness(p.id, S);
    expect(r.requirements.map((x) => x.key)).toEqual(["product", "checkout", "delivery", "deliveryContent"]);
    expect(r).toMatchObject({ ready: true, stage: "ready", mainFunnelId: null });
    await publishProduct(p.id, S);
    expect(await prisma.funnel.count()).toBe(0);
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: p.primaryCheckout.id } })).funnelId).toBeNull();
    // checkout padrão disponível
    expect((await getPublicCheckout(p.primaryCheckout.slug!)).state).toBe("ok");
  });

  it("3, 10–11. compra do PDF: nada antes da confirmação; depois, acesso direto ao ficheiro, sem duplicados", async () => {
    const { p, f } = await pdfProduct();
    await publishProduct(p.id, S);
    const t = await buy(p.primaryCheckout.slug!);
    // pendente: sem destino, sem acesso, sem token de entrega
    expect(await nextDestination(t)).toBeNull();
    expect((await getPaymentView(t))!.accessToken).toBeNull();
    expect(await prisma.delivery.count()).toBe(0);
    await webhook(t);
    await webhook(t);
    expect(await prisma.delivery.count()).toBe(1);
    expect(await prisma.order.count({ where: { status: "APPROVED" } })).toBe(1);
    // sem funil: a página de pagamento encaminha para a página de acesso (token da entrega)
    expect(await nextDestination(t)).toBeNull();
    const tok = (await getPaymentView(t))!.accessToken!;
    expect(tok).toMatch(/^[A-Za-z0-9_-]{30,40}$/);
    const area = (await getAccessArea(tok))!;
    expect(area.products).toEqual([expect.objectContaining({ kind: "MAIN", name: "Ebook PDF", action: expect.objectContaining({ kind: "file", label: "Descarregar produto", href: `/acesso/${tok}/ficheiro/${f.id}` }) })]);
    expect(await fileForBuyer(tok, f.id)).not.toBeNull();
    // a página de obrigado padrão também funciona sem funil (sem WhatsApp configurado)
    const ty = (await getThankYouView(t))!;
    expect(ty).toMatchObject({ state: "confirmed", support: null, button: { label: "Descarregar produto" } });
  });

  it("4–5. produto SaaS sem funil: publica e, depois do pagamento, dá acesso pelo link", async () => {
    const p = await createProduct(form({ name: "App", priceCents: "900,00", deliveryMethod: "EXTERNAL_LINK", accessUrl: "https://app.exemplo.co.mz/entrar" }), S);
    await publishProduct(p.id, S);
    const t = await buy(p.primaryCheckout.slug!);
    await webhook(t);
    const area = (await getAccessArea((await getPaymentView(t))!.accessToken!))!;
    expect(area.products.map((x) => [x.name, x.action?.label, x.action?.href])).toEqual([["App", "Aceder ao meu produto", "https://app.exemplo.co.mz/entrar"]]);
  });

  it("produto sem entrega não pode ser publicado (o entregável continua obrigatório)", async () => {
    const p = await createProduct(form({ name: "Sem entrega" }), S);
    await expect(publishProduct(p.id, S)).rejects.toThrow("método de entrega");
  });
});

describe("modo com funil (opcional)", () => {
  it("6–8. produto com funil: upsell e downsell continuam; o principal mantém o acesso", async () => {
    const { p: main, f } = await pdfProduct("Principal");
    const up = await createProduct(form({ name: "Curso", priceCents: "900,00", deliveryMethod: "EXTERNAL_LINK", accessUrl: "https://curso.exemplo.co.mz" }), S);
    const down = await createProduct(form({ name: "Mini guia", priceCents: "200,00", deliveryMethod: "EXTERNAL_LINK", accessUrl: "https://mini.exemplo.co.mz" }), S);
    const funnel = await createWizardFunnel(main.id, S);
    const saved = await saveWizardFunnel(
      funnel.id,
      {
        name: "Funil",
        productId: main.id,
        offers: [
          { key: "upsell", type: "UPSELL", name: "Upsell", productId: up.id, onDecline: "downsell" },
          { key: "downsell", type: "DOWNSELL", name: "Downsell", productId: down.id },
        ],
        thankYou: { design: defaultThankYouDesign(), fileId: null, stepName: "Obrigado", useSitePage: true, redirectUrl: "" },
        delivery: { method: "FILE", fileId: f.id },
      },
      S,
    );
    expect(saved).toMatchObject({ ok: true });
    await publishProduct(main.id, S);
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: main.primaryCheckout.id } })).funnelId).toBe(funnel.id);
    const t = await buy(main.primaryCheckout.slug!);
    await webhook(t);
    const d = (await nextDestination(t))!;
    expect(d.kind).toBe("upsell");
    const run = d.url.split("/").pop()!;
    expect(await declineUpsell(run, "upsell")).toEqual({ kind: "upsell", url: `/oferta/${run}` });
    const acc = await acceptUpsell(run, "downsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (acc.kind !== "payment_started") throw new Error(acc.kind);
    await webhook(acc.token);
    expect(await nextDestination(acc.token)).toEqual({ kind: "thank_you", url: `/obrigado/${t}` });
    const area = (await getAccessArea((await getPaymentView(t))!.accessToken!))!;
    expect(area.products.map((x) => [x.kind, x.name])).toEqual([
      ["MAIN", "Principal"],
      ["DOWNSELL", "Mini guia"],
    ]);
  });
});
