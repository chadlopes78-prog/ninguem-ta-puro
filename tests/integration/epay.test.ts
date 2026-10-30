// Adaptador EPay contra respostas simuladas no formato EXATO da documentação (docs/epay-api.md).
// O servidor real da EPay não é acessível a partir do ambiente de desenvolvimento; ver PROJECT_STATUS.md.
import { createHmac } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner } from "../helpers/db";
import { checkoutSchema, couponSchema, productSchema } from "@/server/validation/schemas";
import { createProduct } from "../helpers/products";
import { createCheckout } from "@/server/services/checkouts";
import { createCoupon } from "@/server/services/coupons";
import { submitCheckout } from "@/server/services/purchase";
import { getPaymentView, reconcilePendingPayments, refreshPaymentStatus } from "@/server/services/payment-flow";
import { changeOrderStatus } from "@/server/services/orders";
import { getDashboardData } from "@/server/services/metrics";
import { handleWebhook } from "@/server/payments/webhooks";
import { EPAY_API_BASE_URL, EPAY_SIGNATURE_HEADER, epayProvider } from "@/server/payments/providers/epay";
import { getActivePaymentProviders } from "@/server/payments/registry";
import { resolveRange } from "@/lib/dates";
import { centsToDecimalString, decimalStringToCents } from "@/lib/money";
import { scopeOf, type Scope } from "@/server/scope";
import type { AuthUser } from "@/server/auth/service";

const TEST_KEY = "sk_test_51abcDEF_fake_key_for_tests";
const LIVE_KEY = "sk_live_51abcDEF_fake_key_for_tests";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}
let calls: Call[] = [];
let handler: (c: Call) => { status: number; body: unknown };

function json(status: number, body: unknown) {
  return { status, body };
}

function epayPayment(over: Record<string, unknown> = {}) {
  return {
    id: "01j9x7a2c3d4e5f6g7h8j9k0",
    status: "pending",
    amount: "1500.00",
    fee: null,
    net_amount: null,
    currency: "MZN",
    description: "Curso Digital — Preço principal",
    external_reference: "ref",
    payment_type: null,
    payment_url: "https://checkout.epay.co.mz/p/01j9x7a2c3d4e5f6g7h8j9k0",
    created_at: "2026-10-12T10:15:00+02:00",
    ...over,
  };
}

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const call: Call = { url, method: init.method ?? "GET", headers, body: init.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const r = handler(call);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json", "x-request-id": "req_test_1" } });
  });
});
afterAll(() => vi.unstubAllGlobals());

let OWNER: AuthUser;
let S: Scope; // âmbito real da conta proprietária de teste
beforeEach(async () => {
  await resetTestDb();
  OWNER = await testOwner();
  S = scopeOf(OWNER.id, false);
  calls = [];
  handler = (c) => json(201, epayPayment({ external_reference: c.body?.external_reference, amount: centsToDecimalString(Math.round(Number(c.body?.amount) * 100)) }));
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  process.env.EPAY_SECRET_KEY = TEST_KEY;
  process.env.APP_BASE_URL = "https://loja.exemplo.co.mz";
});
afterEach(() => {
  delete process.env.EPAY_SECRET_KEY;
  process.env.APP_BASE_URL = "http://localhost:3000";
});

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;

async function setup(price = "1.500,00") {
  const p = await createProduct(
    productSchema.parse({ name: "Curso Digital", description: "Produto para testes EPay", type: "COURSE", priceCents: price, currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://conteudo.exemplo/curso" }),
    S,
  );
  const c = await createCheckout(
    checkoutSchema.parse({ name: "Checkout EPay", productId: p.id, offerId: p.offers[0].id, title: "Curso", buttonText: "Pagar", primaryColor: "#C8F135", backgroundColor: "#0B0C0E", successTitle: "Ok", successMessage: "Ok", allowCoupons: "on", isActive: "on" }),
    S,
  );
  return { product: p, checkout: c };
}

const buy = (publicId: string, extra: Record<string, unknown> = {}) =>
  submitCheckout(publicId, { name: "Ana Macuácua", email: "ana@exemplo.co.mz", idempotencyKey: key(), ...extra });

const order = (token: string) => prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true, auditLogs: true, delivery: true } });

function callback(body: object, secret = TEST_KEY) {
  const raw = JSON.stringify(body);
  const headers = new Headers({ "content-type": "application/json", "X-EducavelPay-Signature": createHmac("sha256", secret).update(raw).digest("hex") });
  return handleWebhook(epayProvider, raw, headers);
}

const callbackBody = (over: Record<string, unknown> = {}) => ({
  id: "01j9x7a2c3d4e5f6g7h8j9k0",
  external_reference: "ref",
  status: "paid",
  amount: "1500.00",
  fee: "150.00",
  net_amount: "1350.00",
  currency: "MZN",
  payment_type: "mpesa",
  paid_at: "2026-10-12T10:17:20+02:00",
  ...over,
});

describe("conversões monetárias da API", () => {
  it("texto decimal ↔ cêntimos sem vírgula flutuante", () => {
    expect(decimalStringToCents("350.00")).toBe(35000);
    expect(decimalStringToCents("0.29")).toBe(29);
    expect(decimalStringToCents("1250.5")).toBe(125050);
    expect(decimalStringToCents(350)).toBe(35000);
    expect(decimalStringToCents("12,50")).toBeNull();
    expect(decimalStringToCents("-1.00")).toBeNull();
    expect(centsToDecimalString(125050)).toBe("1250.50");
  });
});

describe("configuração", () => {
  it("ativa com chave de teste; produção exige HTTPS; formato inválido é recusado; segredo nunca exposto", async () => {
    expect(epayProvider.isConfigured()).toBe(true);
    expect(epayProvider.environment()).toBe("test");
    expect((await getActivePaymentProviders(OWNER.id))[0]?.id).toBe("epay");

    process.env.EPAY_SECRET_KEY = LIVE_KEY;
    process.env.APP_BASE_URL = "http://loja.local";
    expect(epayProvider.isConfigured()).toBe(false);
    process.env.APP_BASE_URL = "https://loja.exemplo.co.mz";
    expect(epayProvider.isConfigured()).toBe(true);
    expect(epayProvider.environment()).toBe("live");

    process.env.EPAY_SECRET_KEY = "chave-sem-prefixo";
    expect(epayProvider.isConfigured()).toBe(false);
    delete process.env.EPAY_SECRET_KEY;
    expect(await getActivePaymentProviders(OWNER.id)).toHaveLength(0);

    process.env.EPAY_SECRET_KEY = LIVE_KEY;
    const checks = JSON.stringify(epayProvider.configChecks());
    expect(checks).not.toContain(LIVE_KEY);
    expect(checks).not.toContain("51abcDEF");
    expect(checks).toContain("PRODUÇÃO");
  });
});

describe("endereço do site sem APP_BASE_URL (Vercel)", () => {
  afterEach(() => {
    delete process.env.VERCEL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  });

  it("usa o domínio de produção da Vercel e ativa a chave de produção sem configuração extra", async () => {
    delete process.env.APP_BASE_URL;
    delete process.env.APP_URL;
    process.env.EPAY_SECRET_KEY = LIVE_KEY;
    expect(epayProvider.isConfigured()).toBe(false); // fora da Vercel e sem endereço
    process.env.VERCEL = "1";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "ninguem-ta-puro.vercel.app";
    expect(epayProvider.isConfigured()).toBe(true);
    const check = epayProvider.configChecks().find((c) => c.label === "Endereço do site");
    expect(check).toMatchObject({ ok: true });
    expect(check?.detail).toContain("https://ninguem-ta-puro.vercel.app");
    const { resolveAppBaseUrl } = await import("@/server/app-url");
    expect(await resolveAppBaseUrl()).toBe("https://ninguem-ta-puro.vercel.app");

    const { checkout } = await setup();
    await buy(checkout.publicId);
    expect(calls[0].body).toMatchObject({ callback_url: "https://ninguem-ta-puro.vercel.app/api/webhooks/epay" });
    expect(String(calls[0].body?.return_url)).toMatch(/^https:\/\/ninguem-ta-puro\.vercel\.app\/pagamento\//);
  });

  it("APP_BASE_URL manual tem prioridade; domínio inválido é ignorado", async () => {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "dominio-invalido/../x";
    delete process.env.APP_BASE_URL;
    delete process.env.APP_URL;
    const { staticAppBaseUrl } = await import("@/server/app-url");
    expect(staticAppBaseUrl().url).toBeNull();
    process.env.APP_BASE_URL = "https://loja.exemplo.co.mz/";
    expect(staticAppBaseUrl()).toEqual({ url: "https://loja.exemplo.co.mz", source: "env" });
  });
});

describe("criar pagamento (POST /v1/payments)", () => {
  it("pedido conforme a documentação e redirecionamento para o payment_url", async () => {
    const { checkout } = await setup("1.250,50");
    const r = await buy(checkout.publicId, { amountCents: 1, amount: 1 });
    expect(r).toMatchObject({ kind: "payment_started", redirectUrl: "https://checkout.epay.co.mz/p/01j9x7a2c3d4e5f6g7h8j9k0" });
    expect(calls).toHaveLength(1);
    const c = calls[0];
    expect(c.url).toBe(`${EPAY_API_BASE_URL}/payments`);
    expect(c.url).toBe("https://checkout.epay.co.mz/api/v1/payments");
    expect(c.method).toBe("POST");
    expect(c.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
    expect(c.headers["content-type"]).toBe("application/json");
    expect(c.body).toMatchObject({
      amount: 1250.5, // valor da BD, ignorando o que o browser enviou
      currency: "MZN",
      description: "Curso Digital — Preço principal",
      customer_name: "Ana Macuácua",
      customer_email: "ana@exemplo.co.mz",
      callback_url: "https://loja.exemplo.co.mz/api/webhooks/epay",
    });
    expect(String(c.body?.external_reference)).toMatch(/^NTP-[A-Z0-9]{8}-/);
    expect(String(c.body?.return_url)).toMatch(/^https:\/\/loja\.exemplo\.co\.mz\/pagamento\/[A-Za-z0-9_-]+$/);
    expect(String(c.body?.cancel_url)).toMatch(/\?desistiu=1$/);

    if (r.kind !== "payment_started") return;
    const o = await order(r.token);
    expect(o).toMatchObject({ status: "PENDING", isTestPayment: true, provider: "epay", totalCents: 125050 });
    expect(o.payments[0]).toMatchObject({ status: "PENDING", externalId: "01j9x7a2c3d4e5f6g7h8j9k0", environment: "test", redirectUrl: "https://checkout.epay.co.mz/p/01j9x7a2c3d4e5f6g7h8j9k0" });
    // regressar à página de estado mostra "continuar pagamento", nunca "pago"
    handler = () => json(200, epayPayment());
    const v = await getPaymentView(r.token, { refresh: true });
    expect(v).toMatchObject({ state: "pending", continueUrl: "https://checkout.epay.co.mz/p/01j9x7a2c3d4e5f6g7h8j9k0", accessToken: null });
  });

  it("produto com o nome oculto e sem e-mail: a descrição continua com o nome; o e-mail interno nunca é enviado", async () => {
    const { product, checkout } = await setup();
    await prisma.product.update({ where: { id: product.id }, data: { showName: false, collectEmail: false } });
    const r = await submitCheckout(checkout.publicId, { name: "Ana Macuácua", phone: "841234567", idempotencyKey: key() });
    expect(r.kind).toBe("payment_started");
    const body = calls[0].body!;
    expect(body.description).toBe("Curso Digital — Preço principal");
    expect(body).not.toHaveProperty("customer_email");
    expect(body.customer_name).toBe("Ana Macuácua");
  });

  it("sem HTTPS público não envia callback_url (só consulta de estado)", async () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    const { checkout } = await setup();
    await buy(checkout.publicId);
    expect(calls[0].body).not.toHaveProperty("callback_url");
  });

  it.each([
    [401, "Chave em falta, inválida ou revogada."],
    [403, "Conta bloqueada"],
    [422, "The amount field is required."],
    [429, "Too many requests"],
    [503, "Pagamentos suspensos"],
  ])("erro %i → pagamento não iniciado, encomenda cancelada, cupão libertado, mensagem segura", async (status, message) => {
    const { checkout } = await setup();
    await createCoupon(couponSchema.parse({ code: "EPAY10", type: "PERCENT", percentOff: 10, appliesToAll: "on", isActive: "on", maxUses: "5" }), S, "Africa/Maputo");
    handler = () => json(status, { message, ...(status === 422 ? { errors: { amount: [message] } } : {}) });
    const r = await buy(checkout.publicId, { coupon: "EPAY10" });
    expect(r.kind).toBe("payment_not_started");
    if (r.kind === "payment_not_started") {
      expect(r.message).toMatch(/Nada foi cobrado/);
      expect(r.message).not.toContain(message);
      expect(r.message).not.toContain("sk_");
    }
    const o = await prisma.order.findFirstOrThrow({ include: { payments: true } });
    expect(o.status).toBe("CANCELED");
    expect(o.payments[0].status).toBe("FAILED");
    expect((await prisma.coupon.findFirstOrThrow()).usesCount).toBe(0);
    const log = await prisma.integrationLog.findFirstOrThrow({ where: { provider: "epay" }, orderBy: { createdAt: "desc" } });
    expect(log.message).toContain(String(status));
    expect(log.message).not.toContain(TEST_KEY);
  });

  it("falha de rede → não iniciado; nova tentativa com nova chave funciona", async () => {
    const { checkout } = await setup();
    handler = () => {
      throw new TypeError("fetch failed");
    };
    expect((await buy(checkout.publicId)).kind).toBe("payment_not_started");
    handler = (c) => json(201, epayPayment({ external_reference: c.body?.external_reference }));
    expect((await buy(checkout.publicId)).kind).toBe("payment_started");
    expect(await prisma.order.count()).toBe(2);
  });

  it("payment_url fora do domínio da EPay ou valor divergente → não redireciona", async () => {
    const { checkout } = await setup();
    handler = () => json(201, epayPayment({ payment_url: "https://phishing.exemplo/p/1" }));
    expect((await buy(checkout.publicId)).kind).toBe("payment_not_started");
    handler = (c) => (c.url.endsWith("/cancel") ? json(200, { id: "x", status: "cancelled", changed: true }) : json(201, epayPayment({ amount: "1.00" })));
    expect((await buy(checkout.publicId)).kind).toBe("payment_not_started");
    expect(calls.some((c) => c.url.endsWith("/payments/01j9x7a2c3d4e5f6g7h8j9k0/cancel"))).toBe(true);
  });

  it("submissão repetida devolve a mesma encomenda sem novo pedido à EPay", async () => {
    const { checkout } = await setup();
    const k = key();
    const a = await buy(checkout.publicId, { idempotencyKey: k });
    const b = await buy(checkout.publicId, { idempotencyKey: k });
    expect(b).toEqual(a);
    expect(calls).toHaveLength(1);
  });
});

describe("aviso do pagamento (callback assinado)", () => {
  async function started() {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId);
    if (r.kind !== "payment_started") throw new Error(JSON.stringify(r));
    const o = await order(r.token);
    return { token: r.token, ref: o.payments[0].idempotencyKey };
  }

  it("pago: valida assinatura, regista taxa da EPay, entrega; repetição não duplica", async () => {
    const { token, ref } = await started();
    const body = callbackBody({ external_reference: ref });
    expect(await callback(body)).toMatchObject({ status: 200, result: "processed" });
    let o = await order(token);
    expect(o).toMatchObject({ status: "APPROVED", feeCents: 15000, netCents: 135000, externalRef: "01j9x7a2c3d4e5f6g7h8j9k0" });
    expect(o.payments[0]).toMatchObject({ status: "PAID", rawStatus: "paid:mpesa" });
    expect(o.delivery).not.toBeNull();
    // a EPay pode reenviar o mesmo aviso (de 10 em 10 minutos)
    expect(await callback(body)).toMatchObject({ status: 200, result: "duplicate" });
    expect(await callback(body)).toMatchObject({ status: 200, result: "duplicate" });
    o = await order(token);
    expect(o.auditLogs.filter((a) => a.toStatus === "APPROVED")).toHaveLength(1);
    expect(await prisma.delivery.count()).toBe(1);
    expect(await prisma.paymentEvent.count()).toBe(1);
  });

  it("assinatura com outra chave, corpo alterado ou cabeçalho em falta → 401 e nada muda", async () => {
    const { token, ref } = await started();
    const body = callbackBody({ external_reference: ref });
    expect((await callback(body, "sk_test_outra_chave_qualquer")).status).toBe(401);
    const raw = JSON.stringify(body);
    const sig = createHmac("sha256", TEST_KEY).update(raw).digest("hex");
    expect((await handleWebhook(epayProvider, raw.replace("1500.00", "1.00"), new Headers({ [EPAY_SIGNATURE_HEADER]: sig }))).status).toBe(401);
    expect((await handleWebhook(epayProvider, raw, new Headers())).status).toBe(401);
    // assinatura em maiúsculas é aceite (hexadecimal)
    expect((await handleWebhook(epayProvider, raw, new Headers({ [EPAY_SIGNATURE_HEADER]: sig.toUpperCase() }))).status).toBe(200);
    expect((await order(token)).status).toBe("APPROVED");
  });

  it("valor ou moeda divergentes, mesmo assinados, são rejeitados (resposta 2xx para não haver reenvios)", async () => {
    const { token, ref } = await started();
    expect(await callback(callbackBody({ external_reference: ref, amount: "15.00" }))).toMatchObject({ status: 200, result: "rejected" });
    expect(await callback(callbackBody({ external_reference: ref, currency: "USD", id: "01j9x7a2c3d4e5f6g7h8j9k0" , status: "paid", amount: "1500.00", fee: "1.00" }))).toMatchObject({ status: 200 });
    expect((await order(token)).status).toBe("PENDING");
  });

  it("falhado → encomenda falhada, sem entrega", async () => {
    const { token, ref } = await started();
    expect(await callback(callbackBody({ external_reference: ref, status: "failed", fee: null, net_amount: null, paid_at: null }))).toMatchObject({ result: "processed" });
    const o = await order(token);
    expect(o.status).toBe("DECLINED");
    expect(o.delivery).toBeNull();
    expect((await getPaymentView(token))?.state).toBe("failed");
  });

  it("aviso de um pagamento desconhecido é rejeitado", async () => {
    await started();
    expect(await callback(callbackBody({ id: "outro-id", external_reference: "nao-existe" }))).toMatchObject({ result: "rejected" });
  });
});

describe("consulta de estado (GET /v1/payments/{id}) e cancelamento", () => {
  async function started() {
    const { checkout } = await setup();
    const r = await buy(checkout.publicId);
    if (r.kind !== "payment_started") throw new Error();
    return r.token;
  }

  it.each([
    ["paid", "APPROVED"],
    ["failed", "DECLINED"],
    ["cancelled", "CANCELED"],
  ])("estado %s → encomenda %s", async (epayStatus, expected) => {
    const token = await started();
    handler = (c) => {
      expect(c.method).toBe("GET");
      expect(c.url).toBe("https://checkout.epay.co.mz/api/v1/payments/01j9x7a2c3d4e5f6g7h8j9k0");
      expect(c.headers.authorization).toBe(`Bearer ${TEST_KEY}`);
      return json(200, epayPayment({ status: epayStatus, fee: epayStatus === "paid" ? "150.00" : null, payment_type: "emola" }));
    };
    await refreshPaymentStatus((await order(token)).id);
    expect((await order(token)).status).toBe(expected);
  });

  it("consulta indisponível (429) mantém pendente e regista aviso", async () => {
    const token = await started();
    handler = () => json(429, { message: "Too Many Attempts." });
    await refreshPaymentStatus((await order(token)).id);
    expect((await order(token)).status).toBe("PENDING");
  });

  it("reconciliação consulta pendentes antigos", async () => {
    const token = await started();
    handler = () => json(200, epayPayment({ status: "paid", fee: "10.00" }));
    expect(await reconcilePendingPayments(OWNER.id)).toEqual({ checked: 1, changed: 1 });
    expect((await order(token)).status).toBe("APPROVED");
  });

  it("cancelar no painel cancela primeiro na EPay; se já estiver paga (422) não cancela e atualiza", async () => {
    let token = await started();
    handler = (c) => {
      expect(c.url).toMatch(/\/payments\/01j9x7a2c3d4e5f6g7h8j9k0\/cancel$/);
      return json(200, { id: "01j9x7a2c3d4e5f6g7h8j9k0", status: "cancelled", external_reference: "x", changed: true, credited: false, paid_at: null });
    };
    let o = await order(token);
    await changeOrderStatus(o.id, "CANCELED", S, "admin:dono@exemplo.co.mz");
    o = await order(token);
    expect(o.status).toBe("CANCELED");
    expect(o.payments[0].status).toBe("CANCELED");

    await resetTestDb();
    OWNER = await testOwner();
    S = scopeOf(OWNER.id, false);
    handler = (c) => json(201, epayPayment({ external_reference: c.body?.external_reference }));
    token = await started();
    handler = (c) => (c.url.endsWith("/cancel") ? json(422, { message: "O pagamento já está pago." }) : json(200, epayPayment({ status: "paid", fee: "0.00" })));
    o = await order(token);
    await expect(changeOrderStatus(o.id, "CANCELED", S, "admin:x")).rejects.toThrow(/já foi pago/);
    expect((await order(token)).status).toBe("APPROVED");
  });
});

describe("receita", () => {
  it("pagamentos com chave de teste não contam como receita; com chave de produção contam", async () => {
    const { checkout } = await setup();
    const tz = "Africa/Maputo";
    const r1 = await buy(checkout.publicId);
    if (r1.kind !== "payment_started") throw new Error();
    const ref1 = (await order(r1.token)).payments[0].idempotencyKey;
    await callback(callbackBody({ external_reference: ref1 }));

    process.env.EPAY_SECRET_KEY = LIVE_KEY;
    handler = (c) => json(201, epayPayment({ id: "live_payment_000000000001", external_reference: c.body?.external_reference, payment_url: "https://checkout.epay.co.mz/p/live1" }));
    const r2 = await buy(checkout.publicId);
    if (r2.kind !== "payment_started") throw new Error();
    const ref2 = (await order(r2.token)).payments[0].idempotencyKey;
    await callback(callbackBody({ id: "live_payment_000000000001", external_reference: ref2 }), LIVE_KEY);

    const d = await getDashboardData({ scope: S, range: resolveRange({ preset: "today" }, tz), defaultCurrency: "MZN", tz });
    expect(d.kpis.approvedCount).toBe(1);
    expect(d.kpis.grossCents).toBe(150000);
    expect(d.kpis.feeCents).toBe(15000);
    expect(d.kpis.netCents).toBe(135000);
  });
});
