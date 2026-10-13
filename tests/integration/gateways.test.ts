// EPay + E2Payments como gateways independentes. As APIs reais não são acessíveis a partir do ambiente de
// desenvolvimento: as respostas são simuladas no formato da documentação de cada fornecedor
// (docs/epay-api.md e docs/e2payments-api.md).
import { createHmac } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct } from "@/server/services/products";
import { submitCheckout } from "@/server/services/purchase";
import { getPaymentView, listPaymentOptions, reconcilePendingPayments, refreshPaymentStatus, resolveUncertainPayment } from "@/server/services/payment-flow";
import { listGateways, setGatewayEnabled, testGatewayConnection, updateE2Credentials } from "@/server/services/integrations";
import { getActivePaymentProviders, getProvider } from "@/server/payments/registry";
import { handleWebhook } from "@/server/payments/webhooks";
import { epayProvider } from "@/server/payments/providers/epay";
import { e2Amount, e2Reference } from "@/server/payments/providers/e2payments";
import { decryptSecret } from "@/server/secret-box";

const EPAY_KEY = "sk_test_51abcDEF_fake_key_for_tests";
const E2_ID = "e2-client-id-0123456789";
const E2_SECRET = "e2-client-secret-SUPER-SECRET-value";
const ENC_KEY = "chave-de-cifra-apenas-para-testes-0123456789";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}
let calls: Call[] = [];
let e2Token: (c: Call) => { status: number; body: unknown };
let e2Charge: (c: Call) => { status: number; body: unknown } | "timeout";

const E2_HOST_RE = /^https:\/\/(e2payments\.explicador\.co\.mz|mpesaemolatech\.com)\//;
const e2Calls = () => calls.filter((c) => E2_HOST_RE.test(c.url));
const epayCalls = () => calls.filter((c) => c.url.startsWith("https://checkout.epay.co.mz"));

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const raw = init.body ? String(init.body) : null;
    let body: Record<string, unknown> | null = null;
    if (raw) body = headers["content-type"]?.includes("x-www-form-urlencoded") ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw);
    // autenticação HTTP Basic: as credenciais vêm no cabeçalho
    const basic = headers.authorization?.startsWith("Basic ") ? Buffer.from(headers.authorization.slice(6), "base64").toString().split(":").map(decodeURIComponent) : null;
    if (basic && body) body = { ...body, client_id: basic[0], client_secret: basic[1], via: "basic" };
    const call: Call = { url, method: init.method ?? "GET", headers, body };
    calls.push(call);
    let r: { status: number; body: unknown };
    if (E2_HOST_RE.test(url) && url.endsWith("/oauth/token")) r = e2Token(call);
    else if (E2_HOST_RE.test(url) && url.includes("/v1/c2b/")) {
      const out = e2Charge(call);
      if (out === "timeout") throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      r = out;
    } else if (url.startsWith("https://checkout.epay.co.mz/api/v1/payments")) {
      // Resposta de criação conforme docs/epay-api.md
      r = {
        status: 201,
        body: {
          id: "01epaypaymentid0000000001",
          status: "pending",
          amount: String(call.body?.amount),
          fee: null,
          currency: "MZN",
          external_reference: call.body?.external_reference,
          payment_url: "https://checkout.epay.co.mz/p/01epaypaymentid0000000001",
        },
      };
    } else throw new Error(`URL inesperado nos testes: ${url}`);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  });
});
afterAll(() => vi.unstubAllGlobals());

beforeEach(async () => {
  await resetTestDb();
  calls = [];
  e2Token = () => ({ status: 200, body: { token_type: "Bearer", access_token: "tok_abc", expires_in: 3600 } });
  e2Charge = () => ({ status: 201, body: { message: "Transação realizada com sucesso" } });
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  for (const k of ["E2PAYMENTS_CLIENT_ID", "E2PAYMENTS_CLIENT_SECRET", "E2PAYMENTS_MPESA_WALLET_ID", "E2PAYMENTS_EMOLA_WALLET_ID"]) delete process.env[k];
  process.env.EPAY_SECRET_KEY = EPAY_KEY;
  process.env.APP_BASE_URL = "https://loja.exemplo.co.mz";
  process.env.INTEGRATIONS_ENCRYPTION_KEY = ENC_KEY;
});
afterEach(() => {
  delete process.env.EPAY_SECRET_KEY;
  delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
  process.env.APP_BASE_URL = "http://localhost:3000";
});

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;

async function product(price = "1.500,00") {
  const p = await createProduct(
    productSchema.parse({ name: "Curso Digital", description: "Produto para testes de gateways", type: "COURSE", priceCents: price, currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://conteudo.exemplo/curso" }),
    false,
  );
  return { product: p, slug: p.primaryCheckout.slug! };
}

const buy = (slug: string, extra: Record<string, unknown> = {}) => submitCheckout(slug, { name: "Ana Macuácua", email: "ana@exemplo.co.mz", idempotencyKey: key(), ...extra });
const orderOf = (token: string) => prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true, delivery: true, auditLogs: true } });

async function configureE2(wallets: { mpesa?: string; emola?: string } = { mpesa: "111111", emola: "222222" }) {
  const r = await updateE2Credentials({ clientId: E2_ID, clientSecret: E2_SECRET, mpesaWalletId: wallets.mpesa ?? "", emolaWalletId: wallets.emola ?? "" });
  expect(r.ok).toBe(true);
}
async function activateE2() {
  await configureE2();
  expect((await setGatewayEnabled("e2payments", true)).ok).toBe(true);
}
const activeIds = async () => (await getActivePaymentProviders()).map((p) => p.id);

describe("1. EPay mantém-se como estava", () => {
  it("sem qualquer configuração nova, a EPay continua ativa e o checkout funciona como antes (página alojada)", async () => {
    expect(await activeIds()).toEqual(["epay"]);
    const gw = await listGateways();
    expect(gw.find((g) => g.id === "epay")!.status).toBe("active");
    expect(gw.find((g) => g.id === "e2payments")!.status).toBe("credentials_missing");

    const { slug } = await product();
    const r = await buy(slug); // sem método: só existe a opção alojada da EPay (comportamento anterior)
    expect(r.kind).toBe("payment_started");
    if (r.kind !== "payment_started") return;
    expect(r.redirectUrl).toBe("https://checkout.epay.co.mz/p/01epaypaymentid0000000001");
    const o = await orderOf(r.token);
    expect(o.provider).toBe("epay");
    expect(o.payments[0].provider).toBe("epay");
    expect(o.status).toBe("PENDING");
    expect(e2Calls()).toHaveLength(0);
  });
});

describe("2. credenciais da E2Payments", () => {
  it("guardar credenciais não altera a EPay; o segredo fica cifrado e nunca é devolvido", async () => {
    await prisma.integrationConfig.create({ data: { provider: "epay", enabled: true, status: "CONFIGURED", publicConfig: { nota: "existente" } } });
    const before = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "epay" } });

    await configureE2();

    const after = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "epay" } });
    expect(after).toEqual(before);
    expect(process.env.EPAY_SECRET_KEY).toBe(EPAY_KEY);

    const row = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "e2payments" } });
    expect(row.secretConfig).not.toContain(E2_SECRET);
    expect(row.secretConfig).not.toContain(E2_ID);
    expect(JSON.parse(decryptSecret(row.secretConfig)!)).toEqual({ clientId: E2_ID, clientSecret: E2_SECRET });
    expect(row.enabled).toBe(false); // guardar não ativa

    const view = JSON.stringify(await listGateways());
    expect(view).not.toContain(E2_SECRET);
    expect(view).not.toContain(E2_ID);
    expect(view).toContain("••••6789");
    const logs = JSON.stringify(await prisma.integrationLog.findMany());
    expect(logs).not.toContain(E2_SECRET);
    expect(logs).not.toContain(E2_ID);

    // reenviar sem o segredo mantém o valor guardado
    expect((await updateE2Credentials({ mpesaWalletId: "333333", emolaWalletId: "" })).ok).toBe(true);
    const row2 = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "e2payments" } });
    expect(JSON.parse(decryptSecret(row2.secretConfig)!).clientSecret).toBe(E2_SECRET);
    expect(row2.publicConfig).toEqual({ mpesaWalletId: "333333", emolaWalletId: null, apiHost: "https://e2payments.explicador.co.mz" });
  });

  it("sem INTEGRATIONS_ENCRYPTION_KEY guarda-se na mesma, cifrado com a chave do servidor; validação dos campos", async () => {
    delete process.env.INTEGRATIONS_ENCRYPTION_KEY;
    expect((await updateE2Credentials({ clientId: E2_ID, clientSecret: E2_SECRET, mpesaWalletId: "111111" })).ok).toBe(true);
    const row = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "e2payments" } });
    expect(row.secretConfig!.startsWith("v1d:")).toBe(true);
    expect(row.secretConfig).not.toContain(E2_SECRET);
    expect(JSON.parse(decryptSecret(row.secretConfig)!).clientSecret).toBe(E2_SECRET);

    // definir mais tarde uma chave dedicada não estraga o que já estava guardado
    process.env.INTEGRATIONS_ENCRYPTION_KEY = ENC_KEY;
    expect(JSON.parse(decryptSecret(row.secretConfig)!).clientSecret).toBe(E2_SECRET);
    expect((await listGateways()).find((g) => g.id === "e2payments")!.configured).toBe(true);

    // se o segredo do servidor mudar, as credenciais deixam de ser legíveis e o painel pede-as de novo
    const url = process.env.DATABASE_URL!;
    process.env.DATABASE_URL = `${url}&rotated=1`;
    try {
      expect(decryptSecret(row.secretConfig)).toBeNull();
    } finally {
      process.env.DATABASE_URL = url;
    }

    // campos vazios mantêm o Client ID/Secret guardados; IDs de carteira inválidos são recusados
    const bad = await updateE2Credentials({ clientId: "", clientSecret: "", mpesaWalletId: "#abc", emolaWalletId: "x" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(Object.keys(bad.fieldErrors ?? {}).sort()).toEqual(["emolaWalletId", "mpesaWalletId"]);
    }
    expect((await updateE2Credentials({ clientId: "", clientSecret: "", mpesaWalletId: "#222", emolaWalletId: "" })).ok).toBe(true);
    const kept = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "e2payments" } });
    expect(JSON.parse(decryptSecret(kept.secretConfig)!)).toEqual({ clientId: E2_ID, clientSecret: E2_SECRET });
  });

  it("credenciais por variáveis de ambiente têm prioridade e o painel não as sobrepõe", async () => {
    process.env.E2PAYMENTS_CLIENT_ID = E2_ID;
    process.env.E2PAYMENTS_CLIENT_SECRET = E2_SECRET;
    process.env.E2PAYMENTS_MPESA_WALLET_ID = "#555555";
    const g = (await listGateways()).find((x) => x.id === "e2payments")!;
    expect(g.configured).toBe(true);
    expect(g.e2!.fromEnv).toBe(true);
    expect(g.methods).toEqual(["M-Pesa"]);
    expect((await updateE2Credentials({ clientId: "x", clientSecret: "y", mpesaWalletId: "1" })).ok).toBe(false);
  });
});

describe("3–4. ativar e desativar a E2Payments", () => {
  it("só fica ativa depois de a E2Payments aceitar as credenciais; cobra conforme o SDK oficial", async () => {
    await configureE2();
    expect((await listGateways()).find((g) => g.id === "e2payments")!.status).toBe("inactive");
    expect(await activeIds()).toEqual(["epay"]);

    await activateE2();
    expect(await activeIds()).toEqual(["epay", "e2payments"]);
    const token = e2Calls().find((c) => c.url.endsWith("/oauth/token"))!;
    expect(token.body).toEqual({ grant_type: "client_credentials", client_id: E2_ID, client_secret: E2_SECRET });

    const { slug } = await product("1.500,00");
    calls = [];
    const r = await buy(slug, { method: "e2payments:mpesa", phone: "84 123 4567" });
    expect(r.kind).toBe("payment_started");
    if (r.kind !== "payment_started") return;
    expect(r.redirectUrl).toBeNull();

    const charge = e2Calls().find((c) => c.url.includes("/v1/c2b/"))!;
    expect(charge.url).toBe("https://e2payments.explicador.co.mz/v1/c2b/mpesa-payment/111111");
    expect(charge.method).toBe("POST");
    expect(charge.headers.authorization).toBe("Bearer tok_abc");
    expect(charge.headers["content-type"]).toBe("application/json");
    const o = await orderOf(r.token);
    expect(charge.body).toEqual({ client_id: E2_ID, amount: "1500", phone: "841234567", reference: e2Reference(o.code) });
    expect(JSON.stringify(charge.body)).not.toContain(E2_SECRET); // o segredo só vai no pedido de token
    expect(epayCalls()).toHaveLength(0); // só o gateway escolhido é contactado

    expect(o.status).toBe("APPROVED");
    expect(o.provider).toBe("e2payments");
    expect(o.paymentMethod).toBe("mpesa");
    expect(o.payments[0]).toMatchObject({ provider: "e2payments", method: "mpesa", status: "PAID", environment: "live", phoneMasked: "84•••••67" });
    expect(o.payments[0].confirmedAt).not.toBeNull();
    expect(o.delivery).not.toBeNull();
    expect(o.isTestPayment).toBe(false);
  });

  it("credenciais rejeitadas: não ativa e mostra erro de configuração", async () => {
    await configureE2();
    e2Token = () => ({ status: 401, body: { message: "Unauthenticated." } });
    const r = await setGatewayEnabled("e2payments", true);
    expect(r.ok).toBe(false);
    const g = (await listGateways()).find((x) => x.id === "e2payments")!;
    expect(g.status).toBe("config_error");
    expect(g.enabled).toBe(false);
    expect(await activeIds()).toEqual(["epay"]);
  });

  it("mostra o erro devolvido pela E2Payments quando as credenciais são rejeitadas", async () => {
    await configureE2();
    e2Token = () => ({ status: 401, body: { error: "invalid_client", error_description: "Client authentication failed", message: "Client authentication failed" } });
    const r = await testGatewayConnection("e2payments");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("HTTP 401 — invalid_client: Client authentication failed");
    expect(r.message).not.toContain(E2_SECRET);
    // tentou também a combinação inversa, sem nunca registar valores
    expect(e2Calls().filter((c) => c.url.endsWith("/oauth/token")).length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(await prisma.integrationLog.findMany())).not.toContain(E2_SECRET);
  });

  it("Client ID e Client Secret colados trocados: deteta e corrige automaticamente", async () => {
    // a E2Payments só aceita a combinação correta
    e2Token = (c) =>
      c.body?.client_id === E2_ID && c.body?.client_secret === E2_SECRET
        ? { status: 200, body: { token_type: "Bearer", access_token: "tok_abc" } }
        : { status: 401, body: { error: "invalid_client", message: "Client authentication failed" } };
    expect((await updateE2Credentials({ clientId: E2_SECRET, clientSecret: E2_ID, mpesaWalletId: "111111" })).ok).toBe(true);
    const row = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "e2payments" } });
    expect(JSON.parse(decryptSecret(row.secretConfig)!)).toEqual({ clientId: E2_ID, clientSecret: E2_SECRET });
    expect(row.verifiedAt).not.toBeNull();
    expect((await setGatewayEnabled("e2payments", true)).ok).toBe(true);
    expect(await activeIds()).toEqual(["epay", "e2payments"]);
  });

  it("se o servidor só aceitar formulário ou HTTP Basic (formas OAuth padrão), a ligação funciona na mesma", async () => {
    for (const accepted of ["form", "basic"] as const) {
      await resetTestDb();
      calls = [];
      e2Token = (c) => {
        const isForm = c.headers["content-type"]?.includes("x-www-form-urlencoded");
        const ok = c.body?.client_id === E2_ID && c.body?.client_secret === E2_SECRET && (accepted === "basic" ? c.body?.via === "basic" : isForm && c.body?.via !== "basic");
        return ok ? { status: 200, body: { token_type: "Bearer", access_token: `tok_${accepted}` } } : { status: 401, body: { error: "invalid_client", message: "Client authentication failed" } };
      };
      await configureE2();
      expect((await testGatewayConnection("e2payments")).ok).toBe(true);
      expect((await setGatewayEnabled("e2payments", true)).ok).toBe(true);
      const { slug } = await product();
      const r = await buy(slug, { method: "e2payments:mpesa", phone: "841234567" });
      if (r.kind !== "payment_started") throw new Error(r.kind);
      expect((await orderOf(r.token)).status).toBe("APPROVED");
      expect(e2Calls().find((c) => c.url.includes("/v1/c2b/"))!.headers.authorization).toBe(`Bearer tok_${accepted}`);
    }
  });

  it("conta que só autentica no domínio novo (mpesaemolatech.com): usa-o e memoriza-o para os pagamentos", async () => {
    e2Token = (c) =>
      c.url.startsWith("https://mpesaemolatech.com/") && c.body?.client_id === E2_ID && c.body?.client_secret === E2_SECRET
        ? { status: 200, body: { token_type: "Bearer", access_token: "tok_new" } }
        : { status: 401, body: { error: "invalid_client", message: "Client authentication failed" } };
    await configureE2();
    const t = await testGatewayConnection("e2payments");
    expect(t.ok).toBe(true);
    expect(t.message).toContain("mpesaemolatech.com");
    const row = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "e2payments" } });
    expect((row.publicConfig as Record<string, unknown>).apiHost).toBe("https://mpesaemolatech.com");
    expect((await listGateways()).find((g) => g.id === "e2payments")!.e2!.apiHost).toBe("mpesaemolatech.com");

    expect((await setGatewayEnabled("e2payments", true)).ok).toBe(true);
    const { slug } = await product();
    calls = [];
    const r = await buy(slug, { method: "e2payments:mpesa", phone: "841234567" });
    if (r.kind !== "payment_started") throw new Error(r.kind);
    expect((await orderOf(r.token)).status).toBe("APPROVED");
    // domínio memorizado é tentado primeiro: um único pedido de token e o pagamento no mesmo domínio
    const tokenCalls = e2Calls().filter((c) => c.url.endsWith("/oauth/token"));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].url).toBe("https://mpesaemolatech.com/oauth/token");
    expect(e2Calls().find((c) => c.url.includes("/v1/c2b/"))!.url).toBe("https://mpesaemolatech.com/v1/c2b/mpesa-payment/111111");
  });

  it("segredo copiado mascarado ou cifrado é identificado sem contactar a E2Payments", async () => {
    await updateE2Credentials({ clientId: E2_ID, clientSecret: "$2y$10$abcdefghijklmnopqrstuv", mpesaWalletId: "111111" });
    calls = [];
    const r = await testGatewayConnection("e2payments");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("valor cifrado");
    expect(calls).toHaveLength(0);
    expect((await updateE2Credentials({ clientSecret: "abc•••••xyz", mpesaWalletId: "111111" })).ok).toBe(true);
    expect((await testGatewayConnection("e2payments")).message).toContain("mascarado");
  });

  it("remove espaços invisíveis e aspas coladas com as credenciais", async () => {
    expect((await updateE2Credentials({ clientId: `\u200B "${E2_ID}"\u00A0`, clientSecret: `'${E2_SECRET}'\uFEFF`, mpesaWalletId: " #111111 " })).ok).toBe(true);
    const row = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "e2payments" } });
    expect(JSON.parse(decryptSecret(row.secretConfig)!)).toEqual({ clientId: E2_ID, clientSecret: E2_SECRET });
  });

  it("desativar impede novos pagamentos mas mantém credenciais", async () => {
    await activateE2();
    const { slug } = await product();
    expect((await setGatewayEnabled("e2payments", false)).ok).toBe(true);
    expect(await activeIds()).toEqual(["epay"]);
    calls = [];
    const r = await buy(slug, { method: "e2payments:mpesa", phone: "841234567" });
    expect(r).toEqual({ kind: "invalid", fieldErrors: { method: "Escolha um método de pagamento" } });
    expect(calls).toHaveLength(0);
    expect(await prisma.order.count()).toBe(0);
    const row = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "e2payments" } });
    expect(row.secretConfig).toBeTruthy();
    expect((await listGateways()).find((x) => x.id === "e2payments")!.status).toBe("inactive");
    // reativar não pede as credenciais de novo
    expect((await setGatewayEnabled("e2payments", true)).ok).toBe(true);
  });
});

describe("5–7. combinações de gateways", () => {
  it("5. desativar a EPay preserva a configuração e permite reativar", async () => {
    await activateE2();
    expect((await setGatewayEnabled("epay", false)).ok).toBe(true);
    expect(await activeIds()).toEqual(["e2payments"]);
    expect(process.env.EPAY_SECRET_KEY).toBe(EPAY_KEY);
    expect((await listGateways()).find((x) => x.id === "epay")!.status).toBe("inactive");

    const { slug } = await product();
    const viaEpay = await buy(slug, { method: "epay" });
    expect(viaEpay.kind).toBe("invalid");
    expect(epayCalls()).toHaveLength(0);

    expect((await setGatewayEnabled("epay", true)).ok).toBe(true);
    expect(await activeIds()).toEqual(["epay", "e2payments"]);
  });

  it("6. ambos ativos: o comprador escolhe e cada pagamento vai só para o gateway escolhido", async () => {
    await activateE2();
    const options = listPaymentOptions(await getActivePaymentProviders());
    expect(options.map((o) => o.id)).toEqual(["epay", "e2payments:mpesa", "e2payments:emola"]);

    const { slug } = await product();
    // sem escolha, com dois gateways, não se assume nenhum
    expect((await buy(slug)).kind).toBe("invalid");

    calls = [];
    const a = await buy(slug, { method: "epay" });
    expect(a.kind === "payment_started" && a.redirectUrl?.startsWith("https://checkout.epay.co.mz/")).toBe(true);
    expect(e2Calls()).toHaveLength(0);

    calls = [];
    const b = await buy(slug, { method: "e2payments:emola", phone: "86 123 4567" });
    expect(b.kind).toBe("payment_started");
    expect(epayCalls()).toHaveLength(0);
    expect(e2Calls().find((c) => c.url.includes("/v1/c2b/"))!.url).toBe("https://e2payments.explicador.co.mz/v1/c2b/emola-payment/222222");

    const orders = await prisma.order.findMany({ include: { payments: true }, orderBy: { createdAt: "asc" } });
    expect(orders.map((o) => [o.provider, o.payments[0].provider, o.status])).toEqual([
      ["epay", "epay", "PENDING"],
      ["e2payments", "e2payments", "APPROVED"],
    ]);
  });

  it("número de outra operadora é recusado antes de qualquer cobrança", async () => {
    await activateE2();
    const { slug } = await product();
    calls = [];
    const r = await buy(slug, { method: "e2payments:emola", phone: "84 123 4567" });
    expect(r.kind).toBe("invalid");
    if (r.kind === "invalid") expect(r.fieldErrors.phone).toContain("86 ou 87");
    expect(calls).toHaveLength(0);
  });

  it("7. nenhum gateway ativo: sem métodos e sem encomendas", async () => {
    await setGatewayEnabled("epay", false);
    expect(await activeIds()).toEqual([]);
    const { slug } = await product();
    const r = await buy(slug, { method: "epay" });
    expect(r.kind).toBe("payments_unavailable");
    expect(await prisma.order.count()).toBe(0);
    expect(calls).toHaveLength(0);
  });
});

describe("8–10. confirmação e estados da E2Payments", () => {
  it("submissão repetida não cobra duas vezes", async () => {
    await activateE2();
    const { slug } = await product();
    calls = [];
    const idem = key();
    const a = await submitCheckout(slug, { name: "Ana", email: "ana@exemplo.co.mz", method: "e2payments:mpesa", phone: "841234567", idempotencyKey: idem });
    const b = await submitCheckout(slug, { name: "Ana", email: "ana@exemplo.co.mz", method: "e2payments:mpesa", phone: "841234567", idempotencyKey: idem });
    expect(a.kind === "payment_started" && b.kind === "payment_started" && a.token === b.token).toBe(true);
    expect(e2Calls().filter((c) => c.url.includes("/v1/c2b/"))).toHaveLength(1);
    expect(await prisma.delivery.count()).toBe(1);
  });

  it("recusa na carteira (400): encomenda recusada, sem entrega", async () => {
    await activateE2();
    e2Charge = () => ({ status: 400, body: { message: "Saldo insuficiente" } });
    const { slug } = await product();
    const r = await buy(slug, { method: "e2payments:mpesa", phone: "841234567" });
    if (r.kind !== "payment_started") throw new Error(r.kind);
    const o = await orderOf(r.token);
    expect(o.status).toBe("DECLINED");
    expect(o.payments[0].status).toBe("FAILED");
    expect(o.delivery).toBeNull();
  });

  it("sem resposta (tempo excedido): fica por verificar, nunca pago automaticamente; resolução manual auditada", async () => {
    await activateE2();
    e2Charge = () => "timeout";
    const { slug } = await product();
    const r = await buy(slug, { method: "e2payments:mpesa", phone: "841234567" });
    if (r.kind !== "payment_started") throw new Error(r.kind);
    let o = await orderOf(r.token);
    expect(o.status).toBe("PENDING");
    expect(o.payments[0].status).toBe("PENDING");
    expect(o.delivery).toBeNull();

    // visitar a página de estado ou reconciliar não confirma nada (não há consulta documentada)
    await refreshPaymentStatus(o.id);
    await reconcilePendingPayments();
    const view = await getPaymentView(r.token, { refresh: true });
    expect(view!.state).toBe("pending");
    expect(view!.manualReview).toBe(true);
    expect(view!.accessToken).toBeNull();
    o = await orderOf(r.token);
    expect(o.status).toBe("PENDING");

    const done = await resolveUncertainPayment(o.id, "paid", "dono@loja.co.mz");
    expect(done.ok).toBe(true);
    o = await orderOf(r.token);
    expect(o.status).toBe("APPROVED");
    expect(o.delivery).not.toBeNull();
    expect(o.auditLogs.some((a) => a.actor === "manual-verification:e2payments" && a.toStatus === "APPROVED")).toBe(true);
    // não pode ser aplicado duas vezes nem a pagamentos normais
    expect((await resolveUncertainPayment(o.id, "paid", "dono@loja.co.mz")).ok).toBe(false);
  });

  it("carteira sem acesso (403): nada cobrado e o gateway sai do checkout até novo teste", async () => {
    await activateE2();
    e2Charge = () => ({ status: 403, body: { message: "Forbidden" } });
    const { slug } = await product();
    const r = await buy(slug, { method: "e2payments:mpesa", phone: "841234567" });
    expect(r.kind).toBe("payment_not_started");
    const o = await prisma.order.findFirstOrThrow({ include: { payments: true } });
    expect(o.status).toBe("CANCELED");
    expect((await listGateways()).find((x) => x.id === "e2payments")!.status).toBe("config_error");
    expect(await activeIds()).toEqual(["epay"]);
    // um teste de ligação bem-sucedido volta a disponibilizá-lo
    expect((await testGatewayConnection("e2payments")).ok).toBe(true);
    expect(await activeIds()).toEqual(["epay", "e2payments"]);
  });

  it("a E2Payments não aceita notificações (não documentadas)", async () => {
    await activateE2();
    const p = (await getProvider("e2payments"))!;
    expect(p.acceptsWebhooks).toBe(false);
    expect(p.verifySignature("{}", new Headers())).toBe(false);
    expect(p.getStatus).toBeUndefined();
  });

  it("valor e referência no formato dos exemplos oficiais", () => {
    expect(e2Amount(150000)).toBe(1500);
    expect(e2Amount(24790)).toBe(247.9);
    expect(e2Reference("NTP-AB23CD45")).toBe("NTPAB23CD45");
  });
});

describe("11–12. histórico e confirmações com gateway desativado", () => {
  it("pagamentos EPay anteriores mantêm o gateway e continuam a ser confirmados mesmo com a EPay desativada", async () => {
    const { slug } = await product();
    const r = await buy(slug);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    const o = await orderOf(r.token);

    await activateE2();
    await setGatewayEnabled("epay", false);

    // notificação assinada da EPay (formato de docs/epay-api.md) para o pagamento já iniciado
    const raw = JSON.stringify({ id: "01epaypaymentid0000000001", external_reference: o.payments[0].idempotencyKey, status: "paid", amount: "1500.00", fee: "0.00", net_amount: "1500.00", currency: "MZN", payment_type: "mpesa", paid_at: "2026-10-12T10:17:20+02:00" });
    const headers = new Headers({ "content-type": "application/json", "X-EducavelPay-Signature": createHmac("sha256", EPAY_KEY).update(raw).digest("hex") });
    const provider = (await getProvider("epay"))!;
    expect(provider).toBe(epayProvider);
    const out = await handleWebhook(provider, raw, headers);
    expect(out.result).toBe("processed");

    const after = await orderOf(r.token);
    expect(after.status).toBe("APPROVED");
    expect(after.provider).toBe("epay");
    expect(after.payments[0].provider).toBe("epay");
  });
});
