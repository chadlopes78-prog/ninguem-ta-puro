// Muitos clientes em simultâneo no funil Front-end (250 MT) → Upsell 1 (350 MT) → Upsell 2 (500 MT) → Obrigado.
// Cada compra é um pedido próprio com pagamento e referência próprios; o mesmo cliente pode comprar várias vezes;
// duplos cliques, avisos repetidos e avisos tardios nunca duplicam nem alteram outras compras.
// Pagamentos pelo fornecedor de TESTE local (avisos assinados) — sem gateways reais.
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct } from "@/server/services/products";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { createWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { acceptUpsell, declineUpsell, nextDestination } from "@/server/services/post-purchase";
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

let S: Scope;
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
});

let seq = 0;
const key = () => `cc${Date.now().toString(36)}${(seq++).toString(36)}abcdefghij`;
const form = (name: string, price: string) =>
  productSchema.parse({ name, description: `${name} — produto de teste de carga.`, type: "DIGITAL", priceCents: price, currency: "MZN", status: "DRAFT", deliveryMethod: "EXTERNAL_LINK", accessUrl: `https://area.exemplo.co.mz/${name.toLowerCase().replace(/\s+/g, "-")}` });

async function funnel() {
  const main = await createProduct(form("Front End", "250,00"), S);
  const up1 = await createProduct(form("Upsell Um", "350,00"), S);
  const up2 = await createProduct(form("Upsell Dois", "500,00"), S);
  await publishProduct(up1.id, S);
  await publishProduct(up2.id, S);
  const f = await createWizardFunnel(main.id, S);
  const saved = await saveWizardFunnel(
    f.id,
    {
      name: "Funil de carga",
      productId: main.id,
      offers: [
        { key: "upsell1", type: "UPSELL", name: "Upsell 1", productId: up1.id, onAccept: "upsell2", onDecline: "upsell2" },
        { key: "upsell2", type: "UPSELL", name: "Upsell 2", productId: up2.id },
      ],
      thankYou: { design: defaultThankYouDesign(), fileId: null, stepName: "Obrigado", useSitePage: true, redirectUrl: "" },
      delivery: { method: "EXTERNAL_LINK", url: "https://area.exemplo.co.mz/front-end" },
    },
    S,
  );
  expect(saved).toMatchObject({ ok: true });
  await publishProduct(main.id, S);
  return { slug: main.primaryCheckout.slug!, ids: { main: main.id, up1: up1.id, up2: up2.id } };
}

async function notify(token: string, status: "paid" | "failed", eventId?: string) {
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: eventId ?? `ev_${p.id}_${status}`, externalId: p.externalId, reference: p.idempotencyKey, status, amountCents: status === "paid" ? p.amountCents : null, currency: "MZN", feeCents: 0 });
  const r = await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
  expect(r.status).toBe(200);
}

const started = (r: { kind: string; token?: string }) => {
  if (r.kind !== "payment_started" || !r.token) throw new Error(`esperado payment_started, recebido ${JSON.stringify(r)}`);
  return r.token;
};

/** Um cliente: compra o Front-end e segue o funil conforme o perfil (0–3). Telefone pendente (termina em 3). */
async function customer(slug: string, i: number) {
  const email = `cliente${i}@exemplo.co.mz`;
  const phone = `84${String(1000000 + i).slice(-6)}3`;
  const front = started(await submitCheckout(slug, { name: `Cliente ${i}`, email, phone, method: "mpesa", idempotencyKey: key() }));
  // aviso de pagamento repetido em simultâneo (o gateway reenvia)
  await Promise.all([notify(front, "paid"), notify(front, "paid"), notify(front, "paid", `ev_dup_${i}`)]);
  const run = (await nextDestination(front))!.url.split("/").pop()!;
  const profile = i % 4;
  const tokens: { front: string; up1: string | null; up2: string | null } = { front, up1: null, up2: null };

  if (profile === 0 || profile === 1) {
    // duplo clique em «Sim, quero»: a mesma chave em simultâneo → um único pedido
    const k = key();
    const [a, b] = await Promise.all([acceptUpsell(run, "upsell1", { method: "mpesa", phone: "", idempotencyKey: k }), acceptUpsell(run, "upsell1", { method: "mpesa", phone: "", idempotencyKey: k })]);
    tokens.up1 = started(a);
    expect(started(b)).toBe(tokens.up1);
    await notify(tokens.up1, profile === 0 ? "paid" : "failed");
    // a página de pagamento do upsell avança o funil (como no browser)
    const after = (await nextDestination(tokens.up1))!;
    if (profile === 0) expect(after.kind).toBe("upsell");
    // pagamento do upsell falhado: segue o destino configurado; a compra inicial fica intacta
    else expect(after.kind).toBe("thank_you");
  } else {
    await declineUpsell(run, "upsell1");
  }
  if (profile === 0 || profile === 2) {
    tokens.up2 = started(await acceptUpsell(run, "upsell2", { method: "mpesa", phone: "", idempotencyKey: key() }));
    await notify(tokens.up2, "paid");
  } else if (profile === 3) {
    await declineUpsell(run, "upsell2");
  }
  // aviso tardio de falha para o Front-end já pago: nunca o altera
  await notify(front, "failed", `ev_tardio_${i}`);
  // o mesmo cliente volta e compra o Front-end outra vez (compra nova e independente)
  let second: string | null = null;
  if (i % 10 === 0) {
    second = started(await submitCheckout(slug, { name: `Cliente ${i}`, email, phone, method: "mpesa", idempotencyKey: key() }));
    await notify(second, "paid");
  }
  return { i, email, profile, tokens, second };
}

describe("Front-end + upsells com muitos clientes em simultâneo", () => {
  it("100 clientes ao mesmo tempo: cada compra independente, sem duplicados nem mistura de dados", async () => {
    const { slug, ids } = await funnel();
    const N = 100;
    const t0 = Date.now();
    const results = await Promise.all(Array.from({ length: N }, (_, i) => customer(slug, i)));
    const ms = Date.now() - t0;

    const orders = await prisma.order.findMany({ include: { items: true, payments: true, customer: true, delivery: true } });
    const byToken = new Map(orders.map((o) => [o.publicToken!, o]));
    const expected = { approved: 0, declined: 0 };
    for (const r of results) {
      const front = byToken.get(r.tokens.front)!;
      // o Front-end continua aprovado mesmo com o upsell falhado e o aviso tardio de falha
      expect(front).toMatchObject({ status: "APPROVED", totalCents: 25000, parentOrderId: null });
      expect(front.customer.email).toBe(r.email);
      expect(front.items[0].productId).toBe(ids.main);
      expected.approved++;
      if (r.tokens.up1) {
        const up1 = byToken.get(r.tokens.up1)!;
        expect(up1).toMatchObject({ parentOrderId: front.id, totalCents: 35000, customerId: front.customerId, funnelStepKey: "upsell1", status: r.profile === 0 ? "APPROVED" : "DECLINED" });
        expect(up1.items[0].productId).toBe(ids.up1);
        if (r.profile === 0) expected.approved++;
        else expected.declined++;
      }
      if (r.tokens.up2) {
        const up2 = byToken.get(r.tokens.up2)!;
        expect(up2).toMatchObject({ parentOrderId: front.id, totalCents: 50000, customerId: front.customerId, funnelStepKey: "upsell2", status: "APPROVED" });
        expect(up2.items[0].productId).toBe(ids.up2);
        expected.approved++;
      }
      if (r.second) {
        const again = byToken.get(r.second!)!;
        // nova compra do mesmo cliente: pedido, pagamento e referência novos; o mesmo cliente
        expect(again).toMatchObject({ status: "APPROVED", customerId: front.customerId, parentOrderId: null });
        expect(again.id).not.toBe(front.id);
        expected.approved++;
      }
    }
    expect(orders.filter((o) => o.status === "APPROVED")).toHaveLength(expected.approved);
    expect(orders.filter((o) => o.status === "DECLINED")).toHaveLength(expected.declined);
    expect(orders).toHaveLength(expected.approved + expected.declined);
    // 1 pagamento por pedido, referências e chaves únicas
    expect(orders.every((o) => o.payments.length === 1)).toBe(true);
    const refs = orders.map((o) => o.payments[0].idempotencyKey);
    expect(new Set(refs).size).toBe(refs.length);
    expect(new Set(orders.map((o) => o.idempotencyKey)).size).toBe(orders.length);
    // um cliente por pessoa (várias compras no mesmo cliente)
    expect(await prisma.customer.count()).toBe(N);
    // uma entrega por pedido pago, nenhuma para os recusados; uma notificação de venda por pedido pago
    expect(orders.filter((o) => o.status === "APPROVED").every((o) => o.delivery)).toBe(true);
    expect(orders.filter((o) => o.status === "DECLINED").every((o) => !o.delivery)).toBe(true);
    expect(await prisma.notification.count({ where: { type: "SALE_CONFIRMED" } })).toBe(expected.approved);
    // avisos: cada evento registado uma vez
    const events = await prisma.paymentEvent.findMany({ select: { provider: true, externalEventId: true } });
    expect(new Set(events.map((e) => `${e.provider}:${e.externalEventId}`)).size).toBe(events.length);
    console.info(`[carga funil] ${N} clientes, ${orders.length} pedidos (${expected.approved} pagos, ${expected.declined} recusados) em ${ms} ms`);
  }, 240_000);
});
