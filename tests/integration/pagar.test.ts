// Pagar API (guia oficial em docs/pagar-api.md) com a API simulada no formato documentado. Credenciais FICTÍCIAS:
// nunca se usam aqui credenciais reais.
import { createHash, createHmac } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct } from "../helpers/products";
import { submitCheckout } from "@/server/services/purchase";
import { getPaymentView, refreshPaymentStatus } from "@/server/services/payment-flow";
import { handleProviderWebhook } from "@/server/payments/webhooks";
import { getActivePaymentProviders } from "@/server/payments/registry";
import { listGateways, setPagarMode, updatePagarCredentials } from "@/server/services/integrations";
import { verifyPagarWebhook } from "@/server/payments/providers/pagar";
import { scopeOf, type Scope } from "@/server/scope";
import type { AuthUser } from "@/server/auth/service";

const KEY = "sk_test_fictitious_key_for_tests_0001";
const SIGNING = "sig_test_fictitious_signing_secret_0001";
const WEBHOOK = "whsec_test_fictitious_webhook_secret_0001";
const BASE = "https://api.pagar.co.mz/api/v1";

interface Call { method: string; url: string; headers: Record<string, string>; body: string | null }
let calls: Call[] = [];
/** Resposta da API simulada para cada pedido (por omissão: 202 PROCESSING; GET devolve o estado em `remote`). */
let respond: (c: Call) => { status: number; body: unknown } | "network";
const remote = new Map<string, { status: string; amountMzn: number; reference: string; failureReason?: string; safeMessage?: string }>();
let seq = 0;
let remoteSeq = 0;

function paymentJson(id: string, r: { status: string; amountMzn: number; reference: string; failureReason?: string; safeMessage?: string }) {
  return { payment: { id, status: r.status, amountMzn: r.amountMzn, currency: "MZN", method: "MPESA", environment: "TEST", purpose: "PAYMENT", reference: r.reference, title: "x", description: "x", payerPhone: "*****0003", providerTransactionId: null, failureReason: r.failureReason ?? null, safeMessage: r.safeMessage ?? null, paidAt: null, failedAt: null, receipt: null } };
}
const defaultRespond = (c: Call): { status: number; body: unknown } => {
  if (c.method === "POST" && c.url === `${BASE}/payments`) {
    const b = JSON.parse(c.body!);
    const id = `pay_${String(++remoteSeq).padStart(6, "0")}`;
    remote.set(id, { status: "PROCESSING", amountMzn: b.amountMzn, reference: b.reference });
    return { status: 202, body: paymentJson(id, remote.get(id)!) };
  }
  const byId = /\/payments\/(pay_\w+)$/.exec(c.url);
  if (c.method === "GET" && byId && remote.has(byId[1])) return { status: 200, body: paymentJson(byId[1], remote.get(byId[1])!) };
  const byRef = /\/payments\/by-reference\/(.+)$/.exec(c.url);
  if (c.method === "GET" && byRef) {
    const hit = [...remote.entries()].find(([, v]) => v.reference === decodeURIComponent(byRef[1]));
    return hit ? { status: 200, body: paymentJson(hit[0], hit[1]) } : { status: 404, body: { error: "NOT_FOUND", message: "x" } };
  }
  if (c.method === "GET" && c.url === `${BASE}/wallet`) return { status: 200, body: { wallet: { available: 0 } } };
  return { status: 404, body: { error: "NOT_FOUND", message: "x" } };
};

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const call: Call = { method: init.method ?? "GET", url, headers, body: (init.body as string) ?? null };
    calls.push(call);
    const r = respond(call);
    if (r === "network") throw new TypeError("fetch failed");
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  });
});
afterAll(() => vi.unstubAllGlobals());

let OWNER: AuthUser;
let S: Scope;
beforeEach(async () => {
  await resetTestDb();
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  OWNER = await testOwner();
  S = scopeOf(OWNER.id, false);
  calls = [];
  remote.clear();
  remoteSeq = 0;
  respond = defaultRespond;
  process.env.PAGAR_API_KEY = KEY;
  process.env.PAGAR_SIGNING_SECRET = SIGNING;
  process.env.PAGAR_WEBHOOK_SECRET = WEBHOOK;
  process.env.APP_BASE_URL = "https://loja.exemplo.co.mz";
  // ativada e com a ligação verificada (como depois de "Testar ligação")
  await prisma.integrationConfig.create({ data: { ownerId: OWNER.id, provider: "pagar", enabled: true, status: "CONFIGURED", verifiedAt: new Date() } });
});
afterEach(() => {
  for (const k of ["PAGAR_API_KEY", "PAGAR_SIGNING_SECRET", "PAGAR_WEBHOOK_SECRET", "PAGAR_API_BASE_URL"]) delete process.env[k];
  process.env.APP_BASE_URL = "http://localhost:3000";
});

const form = (price = "500,00") => productSchema.parse({ name: "Curso de Excel", description: "Acesso completo ao curso.", type: "COURSE", priceCents: price, currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://conteudo.exemplo/curso" });
const buy = (slug: string, over: Record<string, string> = {}) =>
  submitCheckout(slug, { name: "Ana Macuácua", email: "ana@exemplo.co.mz", phone: "84 000 0003", method: "pagar:mpesa", idempotencyKey: `pg${Date.now()}${seq++}abcdefghijkl`, ...over });

function signedWebhook(body: object, eventId: string, secret = WEBHOOK, t = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  const v1 = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return { raw, headers: new Headers({ "content-type": "application/json", "Pagar-Event-Id": eventId, "Pagar-Signature": `t=${t},v1=${v1}` }) };
}
const event = (paymentId: string, type = "payment.succeeded") => ({ type, data: { payment: { id: paymentId } } });

describe("Pagar — pagamento C2B", () => {
  it("POST /payments assinado como no guia: Bearer, HMAC do pathname e do body, Idempotency-Key; título e valor da BD", async () => {
    const p = await createProduct(form("2.500,00"), S);
    const r = await buy(p.primaryCheckout.slug!);
    expect(r.kind).toBe("payment_started");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.url).toBe(`${BASE}/payments`);
    expect(post.headers.authorization).toBe(`Bearer ${KEY}`);
    const pay = await prisma.payment.findFirstOrThrow();
    expect(post.headers["idempotency-key"]).toBe(`payment:${pay.idempotencyKey}`);
    const body = JSON.parse(post.body!);
    expect(body).toEqual({ reference: pay.idempotencyKey, title: "Curso de Excel — Preço principal", description: expect.stringMatching(/^Pedido NTP-/), amountMzn: 2500, method: "MPESA", payerPhone: "840000003" });
    const ts = post.headers["x-pagar-timestamp"];
    const nonce = post.headers["x-pagar-nonce"];
    expect(ts).toMatch(/^\d+$/);
    const canonical = [ts, nonce, "POST", "/api/v1/payments", createHash("sha256").update(post.body!).digest("hex")].join("\n");
    expect(post.headers["x-pagar-signature"]).toBe("v1=" + createHmac("sha256", SIGNING).update(canonical).digest("hex"));
    expect(pay.externalId).toBe("pay_000001");
    expect(pay.status).toBe("PENDING");
  });

  it("a resposta inicial nunca liberta o produto, mesmo que diga PAID", async () => {
    respond = (c) => {
      const r = defaultRespond(c);
      if (c.method === "POST") {
        const id = (r.body as { payment: { id: string } }).payment.id;
        remote.get(id)!.status = "PAID";
        return { status: 202, body: paymentJson(id, remote.get(id)!) };
      }
      return r;
    };
    const p = await createProduct(form(), S);
    const t = await buy(p.primaryCheckout.slug!);
    if (t.kind !== "payment_started") throw new Error(t.kind);
    const o = await prisma.order.findFirstOrThrow({ include: { delivery: true } });
    expect(o.status).toBe("PENDING");
    expect(o.delivery).toBeNull();
    // a consulta autenticada (GET /payments/:id) é que confirma
    await refreshPaymentStatus(o.id);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("APPROVED");
    const pay = await prisma.payment.findFirstOrThrow({ where: { orderId: o.id } });
    expect(calls.some((c) => c.method === "GET" && c.url === `${BASE}/payments/${pay.externalId}` && c.headers.authorization === `Bearer ${KEY}`)).toBe(true);
  });

  it("valores: só inteiros em MZN entre 20 e 40 000; fora disso não chama a API", async () => {
    for (const price of ["19,00", "40.001,00", "100,50"]) {
      const p = await createProduct({ ...form(price), name: `Curso ${price}` }, S);
      const r = await buy(p.primaryCheckout.slug!);
      expect(r.kind).toBe("payment_not_started");
    }
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    for (const price of ["20,00", "40.000,00"]) {
      const p = await createProduct({ ...form(price), name: `Curso ok ${price}` }, S);
      expect((await buy(p.primaryCheckout.slug!)).kind).toBe("payment_started");
    }
  });

  it("falha de rede/5xx: repete com a MESMA Idempotency-Key e o MESMO body; sem resposta fica incerto e recupera por reference", async () => {
    let posts = 0;
    respond = (c) => (c.method === "POST" && ++posts <= 3 ? (posts === 1 ? "network" : { status: 503, body: { error: "UNAVAILABLE", message: "x" } }) : defaultRespond(c));
    const p = await createProduct(form(), S);
    const t = await buy(p.primaryCheckout.slug!);
    if (t.kind !== "payment_started") throw new Error(t.kind);
    const sent = calls.filter((c) => c.method === "POST");
    expect(sent).toHaveLength(3);
    expect(new Set(sent.map((c) => c.headers["idempotency-key"])).size).toBe(1);
    expect(new Set(sent.map((c) => c.body)).size).toBe(1);
    expect(new Set(sent.map((c) => c.headers["x-pagar-nonce"])).size).toBe(3);
    const o = await prisma.order.findFirstOrThrow({ include: { payments: true } });
    expect(o.status).toBe("PENDING");
    expect((await getPaymentView(t.token))!.uncertain).toBe(true);
    // a Pagar acabou por criar o pagamento: a consulta por reference recupera-o (sem nova cobrança)
    remote.set("pay_lost01", { status: "PAID", amountMzn: 500, reference: o.payments[0].idempotencyKey });
    await refreshPaymentStatus(o.id);
    expect(calls.some((c) => c.url.includes("/payments/by-reference/"))).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("APPROVED");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(3);
  });

  it("400 → não iniciado (nada cobrado); 409 → incerto (consultar antes de decidir); 401 → erro de configuração", async () => {
    const p = await createProduct(form(), S);
    respond = (c) => (c.method === "POST" ? { status: 400, body: { error: "INVALID_PHONE", message: "Telefone inválido", requestId: "req_1" } } : defaultRespond(c));
    expect((await buy(p.primaryCheckout.slug!)).kind).toBe("payment_not_started");
    respond = (c) => (c.method === "POST" ? { status: 409, body: { error: "IDEMPOTENCY_CONFLICT", message: "x" } } : defaultRespond(c));
    const t = await buy(p.primaryCheckout.slug!);
    if (t.kind !== "payment_started") throw new Error(t.kind);
    expect((await getPaymentView(t.token))!.uncertain).toBe(true);
    respond = (c) => (c.method === "POST" ? { status: 401, body: { error: "UNAUTHORIZED", message: "x" } } : defaultRespond(c));
    expect((await buy(p.primaryCheckout.slug!)).kind).toBe("payment_not_started");
    const row = await prisma.integrationConfig.findFirstOrThrow({ where: { ownerId: OWNER.id, provider: "pagar" } });
    expect(row.lastError).toContain("401");
    expect(await getActivePaymentProviders(OWNER.id)).toEqual([]); // deixa de aceitar novos pagamentos
  });
});

describe("Pagar — webhooks", () => {
  async function pending() {
    const p = await createProduct(form(), S);
    const t = await buy(p.primaryCheckout.slug!);
    if (t.kind !== "payment_started") throw new Error(t.kind);
    return prisma.order.findFirstOrThrow({ orderBy: { createdAt: "desc" }, include: { payments: true } });
  }

  it("assinatura válida → consulta autenticada → PAID aprova uma única vez; o mesmo Pagar-Event-Id não repete", async () => {
    const o = await pending();
    const pid = o.payments[0].externalId!;
    remote.get(pid)!.status = "PAID";
    const w = signedWebhook(event(pid), "evt_001");
    const r1 = await handleProviderWebhook("pagar", w.raw, w.headers);
    expect(r1.status).toBe(200);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { delivery: true, auditLogs: true } });
    expect(after.status).toBe("APPROVED");
    expect(after.delivery).not.toBeNull();
    expect((await handleProviderWebhook("pagar", w.raw, w.headers)).result).toBe("duplicate");
    // outro evento para o mesmo pagamento também não duplica a venda
    const w2 = signedWebhook(event(pid), "evt_002");
    expect((await handleProviderWebhook("pagar", w2.raw, w2.headers)).status).toBe(200);
    const final = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { auditLogs: true } });
    expect(final.auditLogs.filter((l) => l.toStatus === "APPROVED")).toHaveLength(1);
    expect(await prisma.notification.count({ where: { orderId: o.id, type: "SALE_CONFIRMED" } })).toBe(1);
  });

  it("o estado vem da consulta, não do corpo: evento 'succeeded' com a Pagar ainda PROCESSING não aprova", async () => {
    const o = await pending();
    const w = signedWebhook(event(o.payments[0].externalId!), "evt_010");
    expect((await handleProviderWebhook("pagar", w.raw, w.headers)).status).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PENDING");
  });

  it("assinatura inválida, segredo errado, fora de prazo ou sem Pagar-Event-Id → rejeitado sem efeitos", async () => {
    const o = await pending();
    const pid = o.payments[0].externalId!;
    remote.get(pid)!.status = "PAID";
    const wrong = signedWebhook(event(pid), "evt_020", "whsec_test_errado_000000000");
    expect((await handleProviderWebhook("pagar", wrong.raw, wrong.headers)).status).toBe(401);
    const old = signedWebhook(event(pid), "evt_021", WEBHOOK, Math.floor(Date.now() / 1000) - 301);
    expect((await handleProviderWebhook("pagar", old.raw, old.headers)).status).toBe(401);
    const ok = signedWebhook(event(pid), "evt_022");
    const tampered = new Headers(ok.headers);
    expect((await handleProviderWebhook("pagar", ok.raw.replace("pay_", "pay_x"), tampered)).status).toBe(401);
    ok.headers.delete("Pagar-Event-Id");
    expect((await handleProviderWebhook("pagar", ok.raw, ok.headers)).status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PENDING");
    expect(await prisma.paymentEvent.count()).toBe(0);
  });

  it("FAILED/CANCELLED confirmados pela consulta encerram a encomenda sem entrega; eventos sem pagamento são ignorados", async () => {
    const o = await pending();
    const pid = o.payments[0].externalId!;
    remote.get(pid)!.status = "CANCELLED";
    const w = signedWebhook(event(pid, "payment.failed"), "evt_030");
    expect((await handleProviderWebhook("pagar", w.raw, w.headers)).status).toBe(200);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { delivery: true } });
    expect(after.status).not.toBe("APPROVED");
    expect(after.delivery).toBeNull();
    const test = signedWebhook({ type: "webhook.test" }, "evt_031");
    expect((await handleProviderWebhook("pagar", test.raw, test.headers)).result).toBe("ignored");
    const topup = signedWebhook({ type: "wallet.topup.succeeded", data: { topup: { id: "tp_1" } } }, "evt_032");
    expect((await handleProviderWebhook("pagar", topup.raw, topup.headers)).result).toBe("ignored");
  });

  it("motivo devolvido pela Pagar na consulta: saldo insuficiente → FALHOU; cancelado pelo cliente → CANCELADO; sem motivo → não indicado", async () => {
    const cases: [string, Record<string, string>, string, string, string][] = [
      ["FAILED", { failureReason: "INSUFFICIENT_BALANCE", safeMessage: "Saldo insuficiente" }, "DECLINED", "INSUFFICIENT_FUNDS", "Saldo insuficiente na carteira do cliente"],
      ["CANCELLED", { failureReason: "Cancelled by customer" }, "CANCELED", "CUSTOMER_CANCELLED", "Cancelado pelo cliente"],
      ["CANCELLED", {}, "CANCELED", "UNKNOWN", "O gateway não indicou o motivo"],
    ];
    for (const [i, [status, why, orderStatus, code, reason]] of cases.entries()) {
      const o = await pending();
      const pid = o.payments[0].externalId!;
      Object.assign(remote.get(pid)!, { status, ...why });
      // o corpo do aviso nunca decide: o estado e o motivo vêm da consulta autenticada
      const w = signedWebhook(event(pid, "payment.failed"), `evt_motivo_${i}`);
      expect((await handleProviderWebhook("pagar", w.raw, w.headers)).status).toBe(200);
      const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { payments: true } });
      expect(after.status).toBe(orderStatus);
      expect(after.payments[0]).toMatchObject({ failureCode: code, failureReason: reason });
    }
  });

  it("validação isolada (guia): t numérico, v1 hex de 64, ±300 s, HMAC de `${t}.${body}`", () => {
    const now = Date.now();
    const w = signedWebhook({ a: 1 }, "evt_x", WEBHOOK, Math.floor(now / 1000));
    expect(verifyPagarWebhook(w.raw, w.headers, WEBHOOK, now)).toEqual({ ok: true, eventId: "evt_x" });
    expect(verifyPagarWebhook(w.raw + " ", w.headers, WEBHOOK, now).ok).toBe(false);
    expect(verifyPagarWebhook(w.raw, w.headers, WEBHOOK, now + 301_000).ok).toBe(false);
    w.headers.set("Pagar-Signature", "t=abc,v1=zz");
    expect(verifyPagarWebhook(w.raw, w.headers, WEBHOOK, now)).toEqual({ ok: false, status: 401 });
  });
});

describe("Pagar — credenciais", () => {
  it("guardadas cifradas por conta, nunca devolvidas; ligação verificada com GET /wallet; variáveis só valem para a conta proprietária", async () => {
    const seller = await testSeller("vendedor@ntp.local");
    // as variáveis PAGAR_* do servidor não servem a outra conta
    expect(await getActivePaymentProviders(seller.id)).toEqual([]);
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "chave-de-cifra-apenas-para-testes-0123456789";
    const r = await updatePagarCredentials(seller.id, { apiKey: "sk_test_vendedor_fictitious_0001", signingSecret: "sig_test_vendedor_fictitious_01", webhookSecret: "whsec_test_vendedor_fictitious_01" });
    expect(r.ok).toBe(true);
    expect(calls.some((c) => c.url === `${BASE}/wallet` && c.headers.authorization === "Bearer sk_test_vendedor_fictitious_0001")).toBe(true);
    const row = await prisma.integrationConfig.findFirstOrThrow({ where: { ownerId: seller.id, provider: "pagar" } });
    expect(row.verifiedAt).not.toBeNull();
    const stored = JSON.stringify(row);
    expect(stored).not.toContain("sk_test_vendedor");
    expect(stored).not.toContain("sig_test_vendedor");
    const view = JSON.stringify(await listGateways(seller.id));
    expect(view).not.toContain("sk_test_vendedor_fictitious");
    expect(view).not.toContain("sig_test_vendedor");
    expect(view).not.toContain("whsec_test_vendedor");
    expect((await updatePagarCredentials(seller.id, { apiKey: "chave-sem-prefixo-000" })).ok).toBe(false);
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  });
});

describe("Pagar — modo de teste e modo real", () => {
  const LIVE = { apiKey: "sk_live_fictitious_key_for_tests_0001", signingSecret: "sig_live_fictitious_signing_0001", webhookSecret: "whsec_live_fictitious_webhook_0001" };
  beforeEach(() => {
    process.env.INTEGRATIONS_ENCRYPTION_KEY = "chave-de-cifra-apenas-para-testes-0123456789";
  });
  afterEach(() => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  });

  it("credenciais de produção guardadas à parte; modo real só com confirmação e com a Pagar a aceitar a key sk_live_", async () => {
    // guardar as credenciais de produção não muda o modo nem a verificação do modo de teste em uso
    const saved = await updatePagarCredentials(OWNER.id, { mode: "live", ...LIVE });
    expect(saved.ok).toBe(true);
    let view = (await listGateways(OWNER.id)).find((g) => g.id === "pagar")!;
    expect(view.pagar!.mode).toBe("test");
    expect(view.status).toBe("active");
    expect(view.pagar!.sets.live.keyEnvironment).toBe("live");
    expect(view.pagar!.sets.test.fromEnv).toBe(true);
    expect(JSON.stringify(view)).not.toContain(LIVE.apiKey);

    // key de teste no formulário do modo real é recusada
    expect((await updatePagarCredentials(OWNER.id, { mode: "live", apiKey: KEY })).ok).toBe(false);
    // sem confirmação não muda
    expect((await setPagarMode(OWNER.id, "live", false)).ok).toBe(false);
    // a Pagar recusa a key: o modo mantém-se
    respond = (c) => (c.url.endsWith("/wallet") ? { status: 401, body: { error: "UNAUTHORIZED", message: "App não aprovada para LIVE" } } : defaultRespond(c));
    expect((await setPagarMode(OWNER.id, "live", true)).ok).toBe(false);
    expect((await listGateways(OWNER.id)).find((g) => g.id === "pagar")!.pagar!.mode).toBe("test");

    respond = defaultRespond;
    const r = await setPagarMode(OWNER.id, "live", true);
    expect(r.ok).toBe(true);
    view = (await listGateways(OWNER.id)).find((g) => g.id === "pagar")!;
    expect(view.pagar!.mode).toBe("live");
    expect(view.environment).toBe("live");
    expect(view.status).toBe("active");

    // novos pagamentos usam a key de produção
    calls = [];
    const p = await createProduct(form(), S);
    expect((await buy(p.primaryCheckout.slug!)).kind).toBe("payment_started");
    expect(calls.find((c) => c.method === "POST")!.headers.authorization).toBe(`Bearer ${LIVE.apiKey}`);

    // webhook assinado com o secret de produção é aceite e consultado com a key de produção
    const pay = await prisma.payment.findFirstOrThrow({ where: { provider: "pagar" } });
    remote.get(pay.externalId!)!.status = "PAID";
    calls = [];
    const w = signedWebhook(event(pay.externalId!), "evt_live_1", LIVE.webhookSecret);
    const out = await handleProviderWebhook("pagar", w.raw, w.headers);
    expect(out.status).toBe(200);
    expect(calls.every((c) => c.headers.authorization === `Bearer ${LIVE.apiKey}`)).toBe(true);
    expect((await prisma.order.findFirstOrThrow({ where: { id: pay.orderId } })).status).toBe("APPROVED");

    // voltar ao modo de teste
    expect((await setPagarMode(OWNER.id, "test", false)).ok).toBe(true);
    expect((await listGateways(OWNER.id)).find((g) => g.id === "pagar")!.pagar!.mode).toBe("test");
  });
});
