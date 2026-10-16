// Funis (sessão 18): várias ofertas em sequência, páginas externas de upsell/downsell com código de integração,
// página de obrigado interna ou externa, registo das vendas por tipo e bloqueio de etapas não autorizadas.
// Pagamentos apenas pelo fornecedor de TESTE local (notificação assinada).
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, publishProduct } from "@/server/services/products";
import { createWizardFunnel, getWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { acceptUpsell, getThankYouView, nextDestination } from "@/server/services/post-purchase";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { defaultThankYouDesign } from "@/lib/thank-you";
import { wizardSchema, type FunnelOfferInput } from "@/lib/funnels/wizard";
import { scopeOf, type Scope } from "@/server/scope";
import { GET as apiGet, POST as apiPost } from "@/app/api/public/funil/v1/[acao]/route";

const SECRET = "segredo-apenas-para-testes";
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

const base = { support: { phone: "+258 84 123 4567" }, delivery: { method: "EXTERNAL_LINK", url: "https://area.exemplo.co.mz/membros" } };
const ty = (over: Record<string, unknown> = {}) => ({ design: defaultThankYouDesign(), fileId: null, stepName: "Obrigado", useSitePage: true, redirectUrl: "", ...over });
const offer = (o: Partial<FunnelOfferInput> & { key: string; productId: string }): FunnelOfferInput => ({ type: "UPSELL", name: o.key, ...o });

async function setup(opts: { offers?: (ids: { extra: string; cheap: string }) => FunnelOfferInput[]; thankYou?: Record<string, unknown> } = {}) {
  const main = await createProduct(form({ name: "Ebook Principal", priceCents: "500,00" }), S);
  const extra = await createProduct(form({ name: "Curso Completo", priceCents: "900,00" }), S);
  const cheap = await createProduct(form({ name: "Módulo Essencial", priceCents: "300,00" }), S);
  const f = await createWizardFunnel(main.id, S, "Funil de teste");
  const payload = { name: "Funil de teste", productId: main.id, offers: opts.offers?.({ extra: extra.id, cheap: cheap.id }) ?? [], thankYou: ty(opts.thankYou), ...base };
  const r = await saveWizardFunnel(f.id, payload, S);
  expect(r).toMatchObject({ ok: true });
  await publishProduct(main.id, S);
  return { main, extra, cheap, funnel: f, payload };
}

const req = (method: "GET" | "POST", acao: string, data: Record<string, string>, json = false) => {
  const url = new URL(`http://localhost/api/public/funil/v1/${acao}`);
  if (method === "GET") for (const [k, v] of Object.entries(data)) url.searchParams.set(k, v);
  const init: { method: string; headers?: Record<string, string>; body?: string } = { method };
  if (method === "POST") {
    if (json) init.headers = { "content-type": "application/json" };
    init.body = json ? JSON.stringify(data) : new URLSearchParams(data).toString();
    if (!json) init.headers = { "content-type": "application/x-www-form-urlencoded" };
  }
  return [new NextRequest(url, init), { params: Promise.resolve({ acao }) }] as const;
};
const call = async (method: "GET" | "POST", acao: string, data: Record<string, string>, json = false) => {
  const [r, ctx] = req(method, acao, data, json);
  return method === "GET" ? apiGet(r, ctx) : apiPost(r, ctx);
};

const upDown = ({ extra, cheap }: { extra: string; cheap: string }) => [
  offer({ key: "upsell", name: "Upsell 1 — Curso", productId: extra, pageUrl: "https://meusite.co.mz/upsell?origem=funil", acceptText: "ACEITAR OFERTA", declineText: "NÃO, OBRIGADO", onDecline: "downsell" }),
  offer({ key: "downsell", type: "DOWNSELL", name: "Downsell 1 — Módulo", productId: cheap, pageUrl: "https://meusite.co.mz/downsell" }),
];

describe("página de obrigado", () => {
  it("1. interna: depois do pagamento confirmado o comprador vai para /obrigado (com confirmação do servidor)", async () => {
    const { main } = await setup();
    const t = await buy(main.primaryCheckout.slug!);
    expect(await nextDestination(t)).toBeNull(); // pendente: nada
    expect((await getThankYouView(t))!.state).toBe("pending");
    await webhook(t);
    expect(await nextDestination(t)).toEqual({ kind: "thank_you", url: `/obrigado/${t}` });
    expect((await getThankYouView(t))!.state).toBe("confirmed");
  });

  it("2–3. externa: desativar a página do site envia para o endereço externo; o endereço é obrigatório", async () => {
    const { main, funnel, payload } = await setup({ thankYou: { useSitePage: false, redirectUrl: "https://meusite.co.mz/obrigado" } });
    const w = (await getWizardFunnel(funnel.id, S))!;
    expect(w.state.thankYou).toMatchObject({ useSitePage: false, redirectUrl: "https://meusite.co.mz/obrigado", stepName: "Obrigado" });
    const t = await buy(main.primaryCheckout.slug!);
    expect(await nextDestination(t)).toBeNull(); // sem confirmação não há redirecionamento
    await webhook(t);
    expect(await nextDestination(t)).toEqual({ kind: "external", url: "https://meusite.co.mz/obrigado" });
    // a página interna não é apagada e continua a validar o estado
    expect(await prisma.thankYouPage.count({ where: { funnelId: funnel.id } })).toBe(1);
    const bad = await saveWizardFunnel(funnel.id, { ...payload, thankYou: ty({ useSitePage: false, redirectUrl: "" }) }, S);
    expect(bad).toMatchObject({ ok: false });
    if (!bad.ok) expect(bad.fieldErrors?.["thankYou.redirectUrl"]).toBeTruthy();
    expect((await saveWizardFunnel(funnel.id, { ...payload, thankYou: ty({ useSitePage: false, redirectUrl: "javascript:alert(1)" }) }, S)).ok).toBe(false);
  });

  it("“Redirecionar para” com a página do site: botão Continuar só com a compra confirmada", async () => {
    const { main } = await setup({ thankYou: { redirectUrl: "https://meusite.co.mz/comunidade" } });
    const t = await buy(main.primaryCheckout.slug!);
    expect((await getThankYouView(t))!.continueUrl).toBeNull();
    await webhook(t);
    expect(await nextDestination(t)).toEqual({ kind: "thank_you", url: `/obrigado/${t}` });
    expect((await getThankYouView(t))!.continueUrl).toBe("https://meusite.co.mz/comunidade");
  });
});

describe("upsell e downsell", () => {
  it("4. upsell com produto selecionado: sem preço escolhido usa o preço principal do produto (servidor)", async () => {
    const { funnel, extra } = await setup({ offers: ({ extra }) => [offer({ key: "upsell", name: "Upsell 1", productId: extra })] });
    const w = (await getWizardFunnel(funnel.id, S))!;
    expect(w.state.offers).toHaveLength(1);
    expect(w.state.offers[0]).toMatchObject({ key: "upsell", type: "UPSELL", name: "Upsell 1", productId: extra.id, offerId: extra.offers[0].id, pageUrl: "" });
  });

  it("5, 13. página externa: o comprador vai para a página com ntp_run/ntp_step; o código comunica com o servidor", async () => {
    const { main } = await setup({ offers: upDown });
    const t = await buy(main.primaryCheckout.slug!);
    await webhook(t);
    const d = (await nextDestination(t))!;
    expect(d.kind).toBe("external");
    const u = new URL(d.url);
    expect(`${u.origin}${u.pathname}`).toBe("https://meusite.co.mz/upsell");
    expect(u.searchParams.get("origem")).toBe("funil"); // parâmetros da página mantidos
    expect(u.searchParams.get("ntp_step")).toBe("upsell");
    const run = u.searchParams.get("ntp_run")!;
    expect(run).toMatch(/^[A-Za-z0-9]{20}$/);
    // estado (CORS, sem dados pessoais)
    const st = await call("GET", "estado", { run, step: "upsell" });
    expect(st.headers.get("access-control-allow-origin")).toBe("*");
    const j = await st.json();
    expect(j).toMatchObject({ ok: true, active: true, step: { key: "upsell", type: "upsell", acceptText: "ACEITAR OFERTA", declineText: "NÃO, OBRIGADO" }, offer: { product: "Curso Completo", priceCents: 90000 } });
    expect(JSON.stringify(j)).not.toMatch(/Ana|exemplo\.co\.mz|841234567/);
    // aceitar via fetch (JSON) → destino de pagamento na plataforma
    const acc = await call("POST", "aceitar", { run, step: "upsell" }, true);
    expect(await acc.json()).toMatchObject({ ok: true, accepted: true, redirect: `http://localhost/oferta/${run}` });
  });

  it("6, 10. aceitar o upsell: o clique não cria venda; a venda de upsell só existe com o pagamento confirmado", async () => {
    const { main, extra, funnel } = await setup({ offers: upDown });
    const t = await buy(main.primaryCheckout.slug!);
    await webhook(t);
    const run = new URL((await nextDestination(t))!.url).searchParams.get("ntp_run")!;
    const before = await prisma.order.count();
    const click = await call("POST", "aceitar", { run, step: "upsell" });
    expect(click.status).toBe(303);
    expect(click.headers.get("location")).toBe(`http://localhost/oferta/${run}`);
    await call("POST", "aceitar", { run, step: "upsell" });
    expect(await prisma.order.count()).toBe(before); // cliques não geram vendas nem encomendas
    // pagamento na plataforma
    const a = await acceptUpsell(run, "upsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (a.kind !== "payment_started") throw new Error(a.kind);
    let child = await prisma.order.findUniqueOrThrow({ where: { publicToken: a.token }, include: { items: true, parentOrder: true } });
    expect(child.status).toBe("PENDING"); // 11. não confirmado: não é venda
    expect(await prisma.order.count({ where: { status: "APPROVED", parentOrderId: { not: null } } })).toBe(0);
    await webhook(a.token);
    await webhook(a.token); // 12. webhook repetido
    child = await prisma.order.findUniqueOrThrow({ where: { publicToken: a.token }, include: { items: true, parentOrder: true } });
    expect(child).toMatchObject({ status: "APPROVED", funnelId: funnel.id, funnelStepKey: "upsell", totalCents: 90000, currency: "MZN" });
    expect(child.parentOrder!.publicToken).toBe(t);
    expect(child.items).toHaveLength(1);
    expect(child.items[0]).toMatchObject({ productId: extra.id, kind: "UPSELL", totalCents: 90000 });
    expect(child.code).not.toBe(child.parentOrder!.code);
    expect(child.externalRef ?? child.provider).toBeTruthy();
    // compra principal continua a ser a principal
    const root = await prisma.order.findUniqueOrThrow({ where: { publicToken: t }, include: { items: true } });
    expect(root.items.map((i) => i.kind)).toEqual(["MAIN"]);
    expect(await prisma.order.count({ where: { parentOrderId: root.id } })).toBe(1);
    expect(await prisma.payment.count({ where: { orderId: child.id, status: "PAID" } })).toBe(1);
    // depois do upsell pago (aceitar → obrigado)
    expect(await nextDestination(a.token)).toEqual({ kind: "thank_you", url: `/obrigado/${t}` });
  });

  it("7–9. recusar o upsell leva ao downsell (página externa); aceitar o downsell regista DOWNSELL; recusar o downsell leva ao obrigado", async () => {
    const { main, cheap } = await setup({ offers: upDown });
    // A: recusar → downsell → aceitar
    const t = await buy(main.primaryCheckout.slug!);
    await webhook(t);
    const run = new URL((await nextDestination(t))!.url).searchParams.get("ntp_run")!;
    const dec = await call("POST", "recusar", { run, step: "upsell" });
    expect(dec.status).toBe(303);
    const down = new URL(dec.headers.get("location")!);
    expect(`${down.origin}${down.pathname}`).toBe("https://meusite.co.mz/downsell");
    expect(down.searchParams.get("ntp_step")).toBe("downsell");
    expect(await prisma.order.count()).toBe(1); // recusar não cria nada
    const a = await acceptUpsell(run, "downsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (a.kind !== "payment_started") throw new Error(a.kind);
    await webhook(a.token);
    const child = await prisma.order.findUniqueOrThrow({ where: { publicToken: a.token }, include: { items: true } });
    expect(child).toMatchObject({ status: "APPROVED", funnelStepKey: "downsell", totalCents: 30000 });
    expect(child.items[0]).toMatchObject({ productId: cheap.id, kind: "DOWNSELL" });

    // B: recusar os dois → obrigado
    const t2 = await buy(main.primaryCheckout.slug!);
    await webhook(t2);
    const run2 = new URL((await nextDestination(t2))!.url).searchParams.get("ntp_run")!;
    await call("POST", "recusar", { run: run2, step: "upsell" });
    const end = await call("POST", "recusar", { run: run2, step: "downsell" }, true);
    expect(await end.json()).toMatchObject({ ok: true, redirect: `http://localhost/obrigado/${t2}` });
    expect(await prisma.order.count({ where: { parentOrder: { publicToken: t2 } } })).toBe(0);
  });

  it("14. etapas não autorizadas: saltar para o downsell, aceitar etapas antigas ou percursos inventados não funciona", async () => {
    const { main } = await setup({ offers: upDown });
    const t = await buy(main.primaryCheckout.slug!);
    // compra ainda não confirmada: nada disponível
    const pendingRun = await prisma.funnelRun.count();
    expect(pendingRun).toBe(0);
    await webhook(t);
    const run = new URL((await nextDestination(t))!.url).searchParams.get("ntp_run")!;
    // tentar aceitar o downsell enquanto a etapa atual é o upsell → volta à etapa atual, nada aceite
    const skip = await call("POST", "aceitar", { run, step: "downsell" }, true);
    const sj = await skip.json();
    expect(sj.accepted).toBe(false);
    expect(new URL(sj.redirect).searchParams.get("ntp_step")).toBe("upsell");
    expect((await acceptUpsell(run, "downsell", { method: "mpesa", idempotencyKey: key() })).kind).toBe("unavailable");
    // recusar uma etapa que não é a atual não avança o percurso
    await call("POST", "recusar", { run, step: "downsell" });
    expect((await prisma.funnelRun.findUniqueOrThrow({ where: { id: run } })).currentStepKey).toBe("upsell");
    // percurso inventado / parâmetros inválidos
    expect((await call("POST", "aceitar", { run: "abcdefghijklmnopqrst", step: "upsell" })).status).toBe(404);
    expect((await call("POST", "aceitar", { run: "x<script>", step: "upsell" })).status).toBe(400);
    expect((await call("POST", "apagar", { run, step: "upsell" })).status).toBe(404);
    // depois de recusar o upsell, voltar a aceitá-lo não é possível (segue para o downsell)
    await call("POST", "recusar", { run, step: "upsell" });
    const again = await (await call("POST", "aceitar", { run, step: "upsell" }, true)).json();
    expect(again.accepted).toBe(false);
    expect(new URL(again.redirect).searchParams.get("ntp_step")).toBe("downsell");
  });

  it("11. compra principal por confirmar ou falhada: as ofertas ficam bloqueadas", async () => {
    const { main } = await setup({ offers: upDown });
    const t = await buy(main.primaryCheckout.slug!);
    await webhook(t, "failed");
    expect(await nextDestination(t)).toBeNull();
    expect(await prisma.funnelRun.count()).toBe(0);
    expect(await prisma.order.count({ where: { status: "APPROVED" } })).toBe(0);
  });

  it("vários upsells em sequência: aceitar o 1.º leva ao 2.º (página da plataforma), cada um com a sua venda", async () => {
    const { main, extra, cheap } = await setup({
      offers: ({ extra, cheap }) => [offer({ key: "upsell", name: "Upsell 1", productId: extra, onAccept: "upsell_2", onDecline: "upsell_2" }), offer({ key: "upsell_2", name: "Upsell 2", productId: cheap })],
    });
    const t = await buy(main.primaryCheckout.slug!);
    await webhook(t);
    const d = (await nextDestination(t))!;
    expect(d.kind).toBe("upsell"); // sem página externa: página de oferta da plataforma
    const run = d.url.split("/").pop()!;
    const a1 = await acceptUpsell(run, "upsell", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (a1.kind !== "payment_started") throw new Error(a1.kind);
    await webhook(a1.token);
    expect(await nextDestination(a1.token)).toEqual({ kind: "upsell", url: `/oferta/${run}` });
    const a2 = await acceptUpsell(run, "upsell_2", { method: "mpesa", phone: "841234567", idempotencyKey: key() });
    if (a2.kind !== "payment_started") throw new Error(a2.kind);
    await webhook(a2.token);
    expect(await nextDestination(a2.token)).toEqual({ kind: "thank_you", url: `/obrigado/${t}` });
    const kids = await prisma.order.findMany({ where: { parentOrder: { publicToken: t } }, include: { items: true }, orderBy: { createdAt: "asc" } });
    expect(kids.map((k) => [k.funnelStepKey, k.items[0].productId, k.items[0].kind, k.status])).toEqual([
      ["upsell", extra.id, "UPSELL", "APPROVED"],
      ["upsell_2", cheap.id, "UPSELL", "APPROVED"],
    ]);
  });
});

describe("validação do editor e funis existentes", () => {
  it("destinos só para etapas seguintes, etapas ligadas, produto diferente do principal e da própria conta", async () => {
    const main = "a".repeat(25);
    const p1 = "b".repeat(25);
    const p2 = "c".repeat(25);
    const parse = (offers: FunnelOfferInput[]) => wizardSchema.safeParse({ name: "Funil", productId: main, offers, thankYou: ty(), ...base });
    expect(parse([offer({ key: "upsell", productId: p1, onDecline: "downsell" }), offer({ key: "downsell", type: "DOWNSELL", productId: p2 })]).success).toBe(true);
    // ciclo / para trás
    expect(parse([offer({ key: "upsell", productId: p1, onDecline: "downsell" }), offer({ key: "downsell", type: "DOWNSELL", productId: p2, onDecline: "upsell" })]).success).toBe(false);
    // etapa sem ligação
    expect(parse([offer({ key: "upsell", productId: p1 }), offer({ key: "downsell", type: "DOWNSELL", productId: p2 })]).success).toBe(false);
    // produto principal como oferta
    expect(parse([offer({ key: "upsell", productId: main })]).success).toBe(false);
    // chaves reservadas / repetidas
    expect(parse([offer({ key: "checkout", productId: p1 })]).success).toBe(false);
    expect(parse([offer({ key: "upsell", productId: p1, onAccept: "upsell" })]).success).toBe(false);
    // página externa só https
    expect(parse([offer({ key: "upsell", productId: p1, pageUrl: "http://meusite.co.mz" })]).success).toBe(false);

    const { funnel, payload } = await setup();
    const foreign = await createProduct(form({ name: "Alheio" }), OTHER);
    const r = await saveWizardFunnel(funnel.id, { ...payload, offers: [offer({ key: "upsell", productId: foreign.id })] }, S);
    expect(r).toMatchObject({ ok: false });
  });

  it("15. funis no formato anterior (afterPayment/upsell/downsell) continuam a guardar e a funcionar", async () => {
    const { main, extra, cheap, funnel } = await setup();
    const legacy = {
      name: "Funil antigo",
      productId: main.id,
      afterPayment: "upsell",
      upsell: { productId: extra.id, offerId: extra.offers[0].id, headline: "Leve o curso", afterDecline: "downsell" },
      downsell: { productId: cheap.id, offerId: cheap.offers[0].id, headline: "Só o módulo?" },
      thankYou: { design: defaultThankYouDesign(), fileId: null },
      ...base,
    };
    expect(await saveWizardFunnel(funnel.id, legacy, S)).toMatchObject({ ok: true });
    const w = (await getWizardFunnel(funnel.id, S))!;
    expect(w.state.offers.map((o) => [o.key, o.type, o.onDecline, o.headline])).toEqual([
      ["upsell", "UPSELL", "downsell", "Leve o curso"],
      ["downsell", "DOWNSELL", "thank_you", "Só o módulo?"],
    ]);
    expect(w.state.upsell?.afterDecline).toBe("downsell");
    expect(w.state.thankYou.useSitePage).toBe(true);
    // guardar de novo com o formato atual (vindo do editor) não perde os textos antigos
    const resave = await saveWizardFunnel(funnel.id, { name: "Funil antigo", productId: main.id, offers: w.state.offers, thankYou: { ...w.state.thankYou }, ...base }, S);
    expect(resave, JSON.stringify(resave)).toMatchObject({ ok: true });
    const again = (await getWizardFunnel(funnel.id, S))!;
    expect(again.state.offers[0].headline).toBe("Leve o curso");
    const t = await buy(main.primaryCheckout.slug!);
    await webhook(t);
    expect((await nextDestination(t))!.kind).toBe("upsell");
  });
});
