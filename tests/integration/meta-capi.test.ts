// Facebook Pixel / API de Conversões: configuração isolada, token cifrado, evento Purchase só para compras
// confirmadas dos produtos escolhidos, sem duplicados, com novas tentativas seguras. A Graph API é simulada (fetch).
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct } from "@/server/services/products";
import { createWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { acceptUpsell, declineUpsell, nextDestination } from "@/server/services/post-purchase";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { defaultThankYouDesign } from "@/lib/thank-you";
import { scopeOf, type Scope } from "@/server/scope";
import { listMetaPixels, processMetaOutbox, recordTrackingContext, saveMetaPixel, deleteMetaPixel } from "@/server/services/meta-capi";

const SECRET = "segredo-apenas-para-testes";
const TOKEN = "EAAGtestTOKENabcdefghijklmnopqrstuvwxyz0123456789";
const TOKEN_B = "EAAGotherACCOUNTtokenZYXWVUTSRQPONMLKJIHGFEDCBA98";
beforeAll(() => {
  process.env.NTP_ENABLE_TEST_PROVIDER = "true";
  process.env.TEST_PROVIDER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
});

const form = (over: Record<string, unknown> = {}) => productSchema.parse({ name: "Guia", description: "Descrição do produto de teste.", type: "EBOOK", priceCents: "100,00", currency: "MZN", status: "DRAFT", ...over });
let S: Scope;
let OTHER: Scope;
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
  OTHER = scopeOf((await testSeller("outra@ntp.local")).id, false);
});

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;
async function webhook(token: string, status: "paid" | "failed") {
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: `ev_${p.id}_${status}`, externalId: p.externalId, reference: p.idempotencyKey, status, amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  return handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
}
async function buy(slug: string, phone = "841234567") {
  const r = await submitCheckout(slug, { name: "Ana Comprador", email: "Ana@Exemplo.co.mz", phone, method: "mpesa", idempotencyKey: key() });
  if (r.kind !== "payment_started") throw new Error(r.kind);
  return r.token;
}
const funnelBase = { thankYou: { design: defaultThankYouDesign(), fileId: null }, support: { phone: "+258 84 123 4567" }, delivery: { method: "EXTERNAL_LINK", url: "https://area.exemplo.co.mz/membros" } };
async function published(scope: Scope, name: string, price = "500,00") {
  const p = await createProduct(form({ name, priceCents: price }), scope);
  const f = await createWizardFunnel(p.id, scope);
  expect(await saveWizardFunnel(f.id, { name: `Funil ${name}`, productId: p.id, afterPayment: "thank_you", ...funnelBase }, scope)).toMatchObject({ ok: true });
  await publishProduct(p.id, scope);
  return p;
}
// O fornecedor local é de TESTE (isTestPayment): só é enviado com código de eventos de teste. Para simular uma
// venda real (produção) marca-se a encomenda como não-teste diretamente na base de dados.
const asLive = (token: string) => prisma.order.update({ where: { publicToken: token }, data: { isTestPayment: false } });
const TC = "TEST12345";

type Call = { url: string; body: Record<string, unknown> };
type MetaEvt = { event_id: string; event_time: number; event_source_url?: string; custom_data: Record<string, unknown>; user_data: { em: string[]; ph: string[]; client_user_agent?: string; fbc?: string } };
const evOf = (c: Call) => (c.body.data as MetaEvt[])[0];
function graph(status = 200, body: unknown = { events_received: 1, fbtrace_id: "AbC123" }) {
  const calls: Call[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("configuração do Pixel", () => {
  it("guarda o ID e o token (cifrado), a seleção de produtos persiste e o token nunca é devolvido", async () => {
    const a = await published(S, "Ebook A");
    const b = await published(S, "Ebook B");
    const r = await saveMetaPixel(S, { pixelId: "123456789012345", token: TOKEN, productIds: [a.id] });
    expect(r.ok).toBe(true);
    const row = await prisma.metaPixel.findFirstOrThrow();
    expect(row.tokenEnc).not.toContain(TOKEN);
    expect(row.tokenEnc).not.toContain(TOKEN.slice(4, 20));
    const [view] = await listMetaPixels(S);
    expect(view).toMatchObject({ pixelId: "123456789012345", enabled: true, productIds: [a.id], tokenHint: `••••${TOKEN.slice(-4)}` });
    expect(JSON.stringify(view)).not.toContain(TOKEN);
    expect(Object.keys(view)).not.toContain("tokenEnc");
    // editar sem token mantém o guardado; nova seleção substitui a anterior
    expect((await saveMetaPixel(S, { id: view.id, pixelId: "123456789012345", token: "", productIds: [b.id], enabled: false })).ok).toBe(true);
    const after = (await listMetaPixels(S))[0];
    expect(after).toMatchObject({ productIds: [b.id], enabled: false });
    expect((await prisma.metaPixel.findFirstOrThrow()).tokenEnc).toBe(row.tokenEnc);
    // atualizar o token
    await saveMetaPixel(S, { id: view.id, pixelId: "123456789012345", token: TOKEN_B, productIds: [b.id] });
    expect((await listMetaPixels(S))[0].tokenHint).toBe(`••••${TOKEN_B.slice(-4)}`);
  });

  it("validação: ID só com algarismos, token obrigatório na criação, sem pixels repetidos", async () => {
    expect((await saveMetaPixel(S, { pixelId: "abc", token: TOKEN })).ok).toBe(false);
    expect((await saveMetaPixel(S, { pixelId: "123456789", token: "" })).ok).toBe(false);
    expect((await saveMetaPixel(S, { pixelId: "123456789", token: "tem espaços no meio do token xx" })).ok).toBe(false);
    expect((await saveMetaPixel(S, { pixelId: "123456789", token: TOKEN })).ok).toBe(true);
    expect((await saveMetaPixel(S, { pixelId: "123456789", token: TOKEN })).ok).toBe(false);
  });

  it("isolamento: não é possível escolher produtos, ver, editar ou apagar Pixels de outra conta", async () => {
    const mine = await published(S, "Meu");
    const theirs = await published(OTHER, "Alheio");
    expect(await saveMetaPixel(S, { pixelId: "111111111", token: TOKEN, productIds: [theirs.id] })).toMatchObject({ ok: false });
    await saveMetaPixel(OTHER, { pixelId: "222222222", token: TOKEN_B, productIds: [theirs.id] });
    const otherPixel = await prisma.metaPixel.findFirstOrThrow({ where: { ownerId: OTHER.ownerId } });
    expect(await listMetaPixels(S)).toEqual([]);
    await expect(saveMetaPixel(S, { id: otherPixel.id, pixelId: "222222222", token: "", productIds: [mine.id] })).rejects.toThrow();
    await expect(deleteMetaPixel(S, otherPixel.id)).rejects.toThrow();
    expect(await prisma.metaPixel.count({ where: { ownerId: OTHER.ownerId } })).toBe(1);
    // modo de demonstração não configura
    expect((await saveMetaPixel(scopeOf(S.ownerId, true), { pixelId: "333333333", token: TOKEN })).ok).toBe(false);
  });
});

describe("evento Purchase", () => {
  it("compra confirmada de produto selecionado: um evento no formato da API de Conversões, token só no corpo", async () => {
    const p = await published(S, "Ebook Moz", "1250,00");
    await saveMetaPixel(S, { pixelId: "123456789012345", token: TOKEN, productIds: [p.id] });
    const t = await buy(p.primaryCheckout.slug!);
    await asLive(t);
    await recordTrackingContext(t, { userAgent: "Mozilla/5.0 Teste", referer: `https://ntp.exemplo/checkout/${p.primaryCheckout.slug}?fbclid=IwAR123abcDEF456&email=x@y.z` });
    const g = graph();
    // pendente: nada
    expect((await processMetaOutbox(25, { fetch: g.fn })).sent).toBe(0);
    expect(g.calls).toHaveLength(0);
    await webhook(t, "paid");
    const r = await processMetaOutbox(25, { fetch: g.fn });
    expect(r).toMatchObject({ created: 1, sent: 1 });
    expect(g.calls).toHaveLength(1);
    const { url, body } = g.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/123456789012345/events");
    expect(url).not.toContain(TOKEN);
    expect(body.access_token).toBe(TOKEN);
    expect(body.test_event_code).toBeUndefined();
    const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: t } });
    const ev = (body.data as MetaEvt[])[0];
    expect(ev).toMatchObject({ event_name: "Purchase", event_id: `purchase_${order.id}`, action_source: "website", event_time: Math.floor(order.approvedAt!.getTime() / 1000) });
    expect(ev.custom_data).toMatchObject({ currency: "MZN", value: 1250, content_ids: [p.id], content_name: "Ebook Moz", content_type: "product", order_id: order.code });
    // dados pessoais só com hash; sem nome, IP ou query do URL
    expect(ev.user_data.em[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(ev.user_data.ph[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(ev.user_data.client_user_agent).toBe("Mozilla/5.0 Teste");
    expect(ev.user_data.fbc).toMatch(/^fb\.1\.\d+\.IwAR123abcDEF456$/);
    expect(JSON.stringify(ev)).not.toMatch(/Ana|exemplo\.co\.mz|841234567|x@y\.z/i);
    expect(ev.event_source_url).not.toContain("?");
    const saved = await prisma.metaEvent.findFirstOrThrow();
    expect(saved).toMatchObject({ status: "SENT", attempts: 1, eventsReceived: 1, fbtraceId: "AbC123" });
  });

  it("pagamentos de teste (sandbox): só com código de eventos de teste, que vai no pedido", async () => {
    const p = await published(S, "Ebook");
    await saveMetaPixel(S, { pixelId: "123456789", token: TOKEN, productIds: [p.id] });
    const t = await buy(p.primaryCheckout.slug!);
    await webhook(t, "paid");
    const g = graph();
    await processMetaOutbox(25, { fetch: g.fn });
    expect(g.calls).toHaveLength(0);
    const px = await prisma.metaPixel.findFirstOrThrow();
    await saveMetaPixel(S, { id: px.id, pixelId: "123456789", token: "", testEventCode: TC, productIds: [p.id] });
    await processMetaOutbox(25, { fetch: g.fn });
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0].body.test_event_code).toBe(TC);
  });

  it("sem duplicados: webhook repetido e processamento repetido/concorrente geram um único envio", async () => {
    const p = await published(S, "Ebook");
    await saveMetaPixel(S, { pixelId: "123456789", token: TOKEN, testEventCode: TC, productIds: [p.id] });
    const t = await buy(p.primaryCheckout.slug!);
    await webhook(t, "paid");
    await webhook(t, "paid");
    const g = graph();
    await Promise.all([processMetaOutbox(25, { fetch: g.fn }), processMetaOutbox(25, { fetch: g.fn })]);
    await processMetaOutbox(25, { fetch: g.fn });
    expect(g.calls).toHaveLength(1);
    expect(await prisma.metaEvent.count()).toBe(1);
  });

  it("não envia: pagamento falhado, produto não selecionado, integração desativada, compras de antes da seleção", async () => {
    const sel = await published(S, "Selecionado");
    const not = await published(S, "Não selecionado");
    const g = graph();
    // compra paga ANTES da configuração: não é enviada retroativamente
    const before = await buy(sel.primaryCheckout.slug!);
    await webhook(before, "paid");
    await saveMetaPixel(S, { pixelId: "123456789", token: TOKEN, testEventCode: TC, productIds: [sel.id] });
    const failed = await buy(sel.primaryCheckout.slug!);
    await webhook(failed, "failed");
    const other = await buy(not.primaryCheckout.slug!);
    await webhook(other, "paid");
    await processMetaOutbox(25, { fetch: g.fn });
    expect(g.calls).toHaveLength(0);
    // desativada: nada
    const px = await prisma.metaPixel.findFirstOrThrow();
    await saveMetaPixel(S, { id: px.id, pixelId: "123456789", token: "", testEventCode: TC, productIds: [sel.id], enabled: false });
    const paid = await buy(sel.primaryCheckout.slug!);
    await webhook(paid, "paid");
    await processMetaOutbox(25, { fetch: g.fn });
    expect(g.calls).toHaveLength(0);
    // reativada: a compra confirmada (recente, depois da seleção) é enviada uma vez
    await saveMetaPixel(S, { id: px.id, pixelId: "123456789", token: "", testEventCode: TC, productIds: [sel.id], enabled: true });
    await processMetaOutbox(25, { fetch: g.fn });
    expect(g.calls).toHaveLength(1);
    const ev = evOf(g.calls[0]);
    expect(ev.event_id).toBe(`purchase_${(await prisma.order.findUniqueOrThrow({ where: { publicToken: paid } })).id}`);
  });

  it("falha temporária: nova tentativa reutiliza o mesmo event_id; erro permanente não repete e não expõe o token", async () => {
    const p = await published(S, "Ebook");
    await saveMetaPixel(S, { pixelId: "123456789", token: TOKEN, testEventCode: TC, productIds: [p.id] });
    const t = await buy(p.primaryCheckout.slug!);
    await webhook(t, "paid");
    const down = graph(503, { error: { message: "Service unavailable" } });
    await processMetaOutbox(25, { fetch: down.fn });
    let ev = await prisma.metaEvent.findFirstOrThrow();
    expect(ev).toMatchObject({ status: "PENDING", attempts: 1 });
    const ok = graph();
    await processMetaOutbox(25, { fetch: ok.fn, now: new Date(Date.now() + 10 * 60_000) });
    expect(evOf(down.calls[0]).event_id).toBe(evOf(ok.calls[0]).event_id);
    ev = await prisma.metaEvent.findFirstOrThrow();
    expect(ev).toMatchObject({ status: "SENT", attempts: 2 });

    // erro 400 com o token no texto: FAILED, sem repetir, mensagem sem o token
    const t2 = await buy(p.primaryCheckout.slug!);
    await webhook(t2, "paid");
    const bad = graph(400, { error: { message: `Invalid OAuth access token ${TOKEN}`, code: 190 } });
    await processMetaOutbox(25, { fetch: bad.fn });
    await processMetaOutbox(25, { fetch: bad.fn, now: new Date(Date.now() + 60 * 60_000) });
    expect(bad.calls).toHaveLength(1);
    const failed = await prisma.metaEvent.findFirstOrThrow({ where: { status: "FAILED" } });
    expect(failed.lastError).toContain("código 190");
    expect(failed.lastError).not.toContain(TOKEN);
    const views = await listMetaPixels(S);
    expect(JSON.stringify(views)).not.toContain(TOKEN);
    const logs = await prisma.integrationLog.findMany({ where: { provider: "meta" } });
    expect(logs.length).toBeGreaterThan(0);
    expect(JSON.stringify(logs)).not.toContain(TOKEN);
  });

  it("isolamento: cada conta usa só o seu Pixel e o seu token", async () => {
    const a = await published(S, "Produto A");
    const b = await published(OTHER, "Produto B");
    await saveMetaPixel(S, { pixelId: "111111111", token: TOKEN, testEventCode: TC, productIds: [a.id] });
    await saveMetaPixel(OTHER, { pixelId: "222222222", token: TOKEN_B, testEventCode: TC, productIds: [b.id] });
    await webhook(await buy(a.primaryCheckout.slug!), "paid");
    await webhook(await buy(b.primaryCheckout.slug!), "paid");
    const g = graph();
    await processMetaOutbox(25, { fetch: g.fn });
    expect(g.calls).toHaveLength(2);
    const byPixel = Object.fromEntries(g.calls.map((c) => [c.url.split("/")[4], c.body]));
    expect(byPixel["111111111"].access_token).toBe(TOKEN);
    expect((byPixel["111111111"].data as MetaEvt[])[0].custom_data.content_ids).toEqual([a.id]);
    expect(byPixel["222222222"].access_token).toBe(TOKEN_B);
    expect((byPixel["222222222"].data as MetaEvt[])[0].custom_data.content_ids).toEqual([b.id]);
  });

  it("upsell e downsell: cada compra confirmada gera o seu evento, com o produto e o valor pagos", async () => {
    const main = await createProduct(form({ name: "Ebook Principal", priceCents: "500,00" }), S);
    const extra = await createProduct(form({ name: "Curso Completo", priceCents: "900,00" }), S);
    const cheaper = await prisma.offer.create({ data: { productId: extra.id, name: "Módulo 1", priceCents: 30000, currency: "MZN" } });
    const f = await createWizardFunnel(main.id, S);
    const saved = await saveWizardFunnel(
      f.id,
      {
        name: "Funil",
        productId: main.id,
        afterPayment: "upsell",
        upsell: { productId: extra.id, offerId: extra.offers[0].id, headline: "Leve o curso", afterDecline: "downsell" },
        downsell: { productId: extra.id, offerId: cheaper.id, headline: "Só o módulo 1?" },
        thankYou: { design: defaultThankYouDesign(), fileId: null },
        support: { phone: "+258 84 123 4567" },
        delivery: { method: "EXTERNAL_LINK", url: "https://area.exemplo.co.mz/membros" },
      },
      S,
    );
    expect(saved).toMatchObject({ ok: true });
    await publishProduct(main.id, S);
    await saveMetaPixel(S, { pixelId: "123456789", token: TOKEN, testEventCode: TC, productIds: [main.id, extra.id] });
    const t = await buy(main.primaryCheckout.slug!);
    await recordTrackingContext(t, { userAgent: "UA-principal", referer: null });
    await webhook(t, "paid");
    const runId = (await nextDestination(t))!.url.split("/").pop()!;
    await declineUpsell(runId, "upsell");
    const acc = await acceptUpsell(runId, "downsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (acc.kind !== "payment_started") throw new Error(acc.kind);
    const g = graph();
    await processMetaOutbox(25, { fetch: g.fn });
    expect(g.calls).toHaveLength(1); // downsell ainda pendente
    await webhook(acc.token, "paid");
    await processMetaOutbox(25, { fetch: g.fn });
    expect(g.calls).toHaveLength(2);
    const [first, second] = g.calls.map((c) => evOf(c));
    expect(first.custom_data).toMatchObject({ content_ids: [main.id], value: 500 });
    expect(second.custom_data).toMatchObject({ content_ids: [extra.id], value: 300 });
    expect(second.event_id).not.toBe(first.event_id);
    expect(second.user_data.client_user_agent).toBe("UA-principal"); // contexto herdado da compra principal
  });
});
