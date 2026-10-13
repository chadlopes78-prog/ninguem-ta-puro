// Plataforma multiutilizador: registo e aprovação, rejeição, suspensão, isolamento absoluto entre contas,
// credenciais de pagamento por conta, conta proprietária e pagamentos/avisos encaminhados para a conta certa.
// EPay contra respostas simuladas no formato da documentação (docs/epay-api.md); nenhum pagamento real.
import { createHmac, randomBytes } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { scopeOf, type Scope } from "@/server/scope";
import { createUser, getUserBySessionToken, login, registerUser, EmailTakenError, type AuthUser } from "@/server/auth/service";
import { accountState, canAdminister, canApplyAdminAction, canUseApp } from "@/server/auth/policy";
import { adminOverview, applyAdminAction, ForbiddenError, getUserDetail, listUsers } from "@/server/services/admin";
import { checkoutSchema, couponSchema, productSchema } from "@/server/validation/schemas";
import { createProduct, getProduct, listProducts, updateProduct, DomainError, NotFoundError } from "@/server/services/products";
import { createCheckout, deleteCheckout, getCheckout, getPublicCheckout, listCheckouts } from "@/server/services/checkouts";
import { createFunnel, getFunnelRecord, saveFunnel } from "@/server/services/funnels";
import { createCoupon, listCoupons } from "@/server/services/coupons";
import { getOrder, listOrders, listCustomers } from "@/server/services/orders";
import { getFinanceReport, listTransactions, recordRefund } from "@/server/services/finance";
import { getDashboardData } from "@/server/services/metrics";
import { submitCheckout } from "@/server/services/purchase";
import { listGateways, setGatewayEnabled, updateE2Credentials, updateEPayCredentials } from "@/server/services/integrations";
import { getActivePaymentProviders } from "@/server/payments/registry";
import { gatewayContext, epayKeyForDisplay } from "@/server/payments/gateways";
import { handleProviderWebhook } from "@/server/payments/webhooks";
import { EPAY_SIGNATURE_HEADER } from "@/server/payments/providers/epay";
import { getSettings, updateSettings } from "@/server/services/settings";
import { resolveRange } from "@/lib/dates";
import { centsToDecimalString } from "@/lib/money";

const OWNER_ENV_KEY = "sk_test_OWNER_env_key_for_tests_only";
const KEY_A = "sk_test_AAAA_seller_a_key_for_tests";
const KEY_B = "sk_test_BBBB_seller_b_key_for_tests";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}
let calls: Call[] = [];
let lastEpayId = "";

beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method: init.method ?? "GET", headers, body });
    // EPay: POST /payments devolve um pagamento pendente com um id único (formato documentado)
    lastEpayId = `01j${randomBytes(10).toString("hex")}`;
    const payment = {
      id: lastEpayId,
      status: "pending",
      amount: centsToDecimalString(Math.round(Number(body?.amount ?? 0) * 100)),
      fee: null,
      currency: "MZN",
      external_reference: body?.external_reference,
      payment_url: `https://checkout.epay.co.mz/p/${lastEpayId}`,
    };
    return new Response(JSON.stringify(payment), { status: 201, headers: { "content-type": "application/json" } });
  });
});
afterAll(() => vi.unstubAllGlobals());

let OWNER: AuthUser;
let A: AuthUser;
let B: AuthUser;
let SO: Scope;
let SA: Scope;
let SB: Scope;

beforeEach(async () => {
  await resetTestDb();
  calls = [];
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
  for (const k of ["E2PAYMENTS_CLIENT_ID", "E2PAYMENTS_CLIENT_SECRET", "E2PAYMENTS_MPESA_WALLET_ID", "E2PAYMENTS_EMOLA_WALLET_ID"]) delete process.env[k];
  // configuração anterior da plataforma (variável de ambiente) — pertence só à conta proprietária
  process.env.EPAY_SECRET_KEY = OWNER_ENV_KEY;
  process.env.APP_BASE_URL = "https://loja.exemplo.co.mz";
  OWNER = await testOwner("chadlopesff@gmail.com");
  A = await testSeller("vendedor.a@exemplo.co.mz", "Vendedor A");
  B = await testSeller("vendedor.b@exemplo.co.mz", "Vendedor B");
  SO = scopeOf(OWNER.id, false);
  SA = scopeOf(A.id, false);
  SB = scopeOf(B.id, false);
});
afterEach(() => {
  delete process.env.EPAY_SECRET_KEY;
  process.env.APP_BASE_URL = "http://localhost:3000";
});

let seq = 0;
const idem = () => `idem${Date.now()}${seq++}abcdefgh`;

async function productFor(s: Scope, name = "Ebook Isolado") {
  return createProduct(productSchema.parse({ name, description: `${name} para testes`, type: "EBOOK", priceCents: "500,00", currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://conteudo.exemplo/x" }), s);
}

function epaySigned(body: object, key: string) {
  const raw = JSON.stringify(body);
  return { raw, headers: new Headers({ "content-type": "application/json", [EPAY_SIGNATURE_HEADER]: createHmac("sha256", key).update(raw).digest("hex") }) };
}

async function enableEPayFor(user: AuthUser, key: string) {
  expect(await updateEPayCredentials(user.id, { secretKey: key })).toMatchObject({ ok: true });
  expect(await setGatewayEnabled(user.id, "epay", true)).toMatchObject({ ok: true });
}

// ───────────────────────── A — Aprovação ─────────────────────────
describe("A. registo e aprovação", () => {
  it("conta nova fica pendente (definido no servidor); sem acesso; aprovada entra sem novo registo", async () => {
    const u = await registerUser({ email: "Nova.Conta@Exemplo.co.mz", name: "Nova Conta", password: "password-123456" });
    expect(u).toMatchObject({ role: "USER", status: "PENDING_APPROVAL", bannedAt: null, email: "nova.conta@exemplo.co.mz" });
    expect(accountState(u)).toBe("pending");
    expect(canUseApp(u)).toBe(false);
    // pode iniciar sessão, mas a sessão não dá acesso ao painel
    const l1 = await login("nova.conta@exemplo.co.mz", "password-123456");
    expect(l1.ok).toBe(true);
    if (!l1.ok) throw new Error();
    expect(canUseApp((await getUserBySessionToken(l1.token))!)).toBe(false);
    // aprovação pelo proprietário
    await applyAdminAction(OWNER, u.id, "approve");
    const l2 = await login("nova.conta@exemplo.co.mz", "password-123456");
    if (!l2.ok) throw new Error("login falhou");
    const session = (await getUserBySessionToken(l2.token))!;
    expect(accountState(session)).toBe("approved");
    expect(canUseApp(session)).toBe(true);
    expect(await prisma.user.count({ where: { email: "nova.conta@exemplo.co.mz" } })).toBe(1);
    // o mesmo email não pode criar segunda conta
    await expect(registerUser({ email: "nova.conta@exemplo.co.mz", name: "Outra", password: "password-123456" })).rejects.toBeInstanceOf(EmailTakenError);
    // ficou registado no histórico administrativo
    expect(await prisma.adminAuditLog.findMany({ where: { targetUserId: u.id } })).toMatchObject([{ action: "approve", fromState: "pending", toState: "approved", actorId: OWNER.id }]);
  });
});

// ───────────────────────── B — Rejeição ─────────────────────────
describe("B. rejeição", () => {
  it("rejeitada fica sem acesso; não é apagada; não pode registar-se de novo com o mesmo email", async () => {
    const u = await registerUser({ email: "rejeitar@exemplo.co.mz", name: "A Rejeitar", password: "password-123456" });
    await applyAdminAction(OWNER, u.id, "reject");
    const db = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(db.status).toBe("REJECTED");
    expect(accountState(db)).toBe("rejected");
    expect(canUseApp(db)).toBe(false);
    await expect(registerUser({ email: "rejeitar@exemplo.co.mz", name: "De novo", password: "password-123456" })).rejects.toBeInstanceOf(EmailTakenError);
    // regra explícita: só o proprietário pode aprovar mais tarde uma conta rejeitada
    await applyAdminAction(OWNER, u.id, "approve");
    expect(accountState(await prisma.user.findUniqueOrThrow({ where: { id: u.id } }))).toBe("approved");
  });
});

// ───────────────────────── C — Banimento ─────────────────────────
describe("C. suspensão (ban) e desbanimento", () => {
  it("bloqueia o acesso, termina sessões e preserva dados; desbanir devolve o estado de aprovação anterior", async () => {
    const p = await productFor(SA, "Produto de A");
    const l = await login(A.email, "password-123456");
    if (!l.ok) throw new Error();
    await applyAdminAction(OWNER, A.id, "ban", "Teste de suspensão");
    const db = await prisma.user.findUniqueOrThrow({ where: { id: A.id } });
    expect(db.status).toBe("APPROVED"); // a aprovação não muda
    expect(db.bannedAt).toBeInstanceOf(Date);
    expect(accountState(db)).toBe("banned");
    expect(canUseApp(db)).toBe(false);
    expect(await getUserBySessionToken(l.token)).toBeNull(); // sessões terminadas
    // os checkouts da conta suspensa deixam de vender; os dados ficam
    expect((await getPublicCheckout(p.primaryCheckout.slug!)).state).toBe("unavailable");
    expect(await prisma.product.count({ where: { ownerId: A.id } })).toBe(1);
    // desbanir: volta a aprovada
    await applyAdminAction(OWNER, A.id, "unban");
    expect(accountState(await prisma.user.findUniqueOrThrow({ where: { id: A.id } }))).toBe("approved");
    expect((await getPublicCheckout(p.primaryCheckout.slug!)).state).toBe("ok");
    // conta pendente banida e desbanida continua pendente
    const pend = await registerUser({ email: "pend@exemplo.co.mz", name: "Pendente", password: "password-123456" });
    await applyAdminAction(OWNER, pend.id, "ban");
    await applyAdminAction(OWNER, pend.id, "unban");
    expect(accountState(await prisma.user.findUniqueOrThrow({ where: { id: pend.id } }))).toBe("pending");
  });

  it("o proprietário não pode ser banido nem banir-se; utilizadores comuns não executam ações administrativas", async () => {
    expect(canApplyAdminAction(OWNER, OWNER, "ban")).toMatchObject({ ok: false });
    await expect(applyAdminAction(OWNER, OWNER.id, "ban")).rejects.toBeInstanceOf(DomainError);
    await expect(applyAdminAction(A, B.id, "ban")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(applyAdminAction(A, OWNER.id, "ban")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(applyAdminAction(A, A.id, "approve")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listUsers(A, {})).rejects.toBeInstanceOf(ForbiddenError);
    await expect(adminOverview(B)).rejects.toBeInstanceOf(ForbiddenError);
    expect(accountState(await prisma.user.findUniqueOrThrow({ where: { id: OWNER.id } }))).toBe("approved");
    expect(await prisma.adminAuditLog.count()).toBe(0);
  });
});

// ───────────────────────── D — Isolamento ─────────────────────────
describe("D. isolamento absoluto entre contas", () => {
  it("produtos, checkouts, funis, cupões, clientes, pedidos e relatórios de A são invisíveis e intocáveis para B", async () => {
    const pa = await productFor(SA, "Produto de A");
    const ca = await getCheckout(pa.primaryCheckout.id, SA);
    const fa = await createFunnel({ name: "Funil de A" }, SA);
    await createCoupon(couponSchema.parse({ code: "PROMO10", type: "PERCENT", percentOff: "10", appliesToAll: "on", isActive: "on" }), SA, "Africa/Maputo");
    // venda de A (demonstração não; manual de teste em modo real)
    const c = await prisma.customer.create({ data: { email: "cliente@ex.co.mz", name: "Cliente", ownerId: A.id } });
    const oa = await prisma.order.create({
      data: { code: "NTP-ISOL1234", customerId: c.id, status: "APPROVED", source: "CHECKOUT", currency: "MZN", subtotalCents: 50000, totalCents: 50000, netCents: 50000, provider: "epay", ownerId: A.id, approvedAt: new Date(), items: { create: { productId: pa.id, kind: "MAIN", description: "x", unitPriceCents: 50000, totalCents: 50000 } } },
    });

    // leitura direta por id (IDs alterados manualmente num pedido HTTP) → não encontrado
    await expect(getProduct(pa.id, SB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getCheckout(ca.id, SB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getFunnelRecord(fa.id, SB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(getOrder(oa.id, SB)).rejects.toBeInstanceOf(NotFoundError);
    // listas
    expect(await listProducts({ scope: SB })).toHaveLength(0);
    expect(await listCheckouts({ scope: SB })).toHaveLength(0);
    expect(await listCoupons({ scope: SB })).toHaveLength(0);
    expect((await listOrders({ scope: SB })).total).toBe(0);
    expect(await listCustomers({ scope: SB })).toHaveLength(0);
    // escrita/eliminação com ids de A → não encontrado; nada muda
    await expect(updateProduct(pa.id, productSchema.parse({ name: "Roubado", description: "Descrição suficientemente longa", type: "EBOOK", priceCents: "1,00", currency: "MZN", status: "PUBLISHED" }), SB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteCheckout(ca.id, SB)).rejects.toBeInstanceOf(NotFoundError);
    await expect(recordRefund({ orderId: oa.id, amountCents: 100, confirmedAtGateway: true }, SB, "admin:b")).rejects.toBeInstanceOf(NotFoundError);
    expect((await getProduct(pa.id, SA)).name).toBe("Produto de A");
    // B não pode usar produtos/ofertas de A nos seus checkouts e funis
    await expect(
      createCheckout(checkoutSchema.parse({ name: "Roubo", productId: pa.id, offerId: pa.offers[0].id, title: "Checkout roubado", buttonText: "Pagar", primaryColor: "#C8F135", backgroundColor: "#0B0C0E", successTitle: "Ok", successMessage: "Ok", isActive: "on" }), SB),
    ).rejects.toBeInstanceOf(DomainError);
    const fb = await createFunnel({ name: "Funil de B" }, SB);
    const graph = { nodes: [{ key: "start", type: "START" as const, label: "Início", position: { x: 0, y: 0 }, config: {} }, { key: "checkout", type: "CHECKOUT" as const, label: "Checkout", position: { x: 1, y: 0 }, config: { checkoutId: ca.id } }], edges: [{ key: "e1", source: "start", target: "checkout", sourceHandle: "next" as const }] };
    const saved = await saveFunnel(fb.id, { name: "Funil de B", graph }, SB);
    expect(saved.validation.valid).toBe(false); // o checkout de A não existe para B
    // o mesmo código de cupão e o mesmo cliente podem existir em contas diferentes, separados
    await createCoupon(couponSchema.parse({ code: "PROMO10", type: "PERCENT", percentOff: "50", appliesToAll: "on", isActive: "on" }), SB, "Africa/Maputo");
    expect((await listCoupons({ scope: SA }))[0].percentOff).toBe(10);
    // relatórios e dashboard
    const range = resolveRange({ preset: "today" }, "Africa/Maputo");
    expect((await getFinanceReport({ scope: SA, range, defaultCurrency: "MZN", tz: "Africa/Maputo" })).kpis.grossCents).toBe(50000);
    expect((await getFinanceReport({ scope: SB, range, defaultCurrency: "MZN", tz: "Africa/Maputo" })).kpis.grossCents).toBe(0);
    expect((await listTransactions(SB, range, {})).total).toBe(0);
    expect((await getDashboardData({ scope: SB, range, defaultCurrency: "MZN", tz: "Africa/Maputo" })).hasAnyOrder).toBe(false);
    // o dashboard do proprietário também não mistura vendas de A
    expect((await getFinanceReport({ scope: SO, range, defaultCurrency: "MZN", tz: "Africa/Maputo" })).kpis.grossCents).toBe(0);
  });

  it("configurações e modo de demonstração são de cada conta", async () => {
    await updateSettings(A.id, { businessName: "Loja A", defaultCurrency: "MZN", locale: "pt-MZ", timezone: "Africa/Maputo" });
    expect((await getSettings(A.id)).businessName).toBe("Loja A");
    expect((await getSettings(B.id)).businessName).not.toBe("Loja A");
    expect((await getSettings(OWNER.id)).businessName).not.toBe("Loja A");
  });
});

// ───────────────────────── E — Credenciais ─────────────────────────
describe("E. credenciais de pagamento separadas por conta", () => {
  it("cada conta gere só a sua EPay/E2Payments; alterar uma nunca muda outra nem a do proprietário; nada é revelado", async () => {
    await enableEPayFor(A, KEY_A);
    await enableEPayFor(B, KEY_B);
    expect(epayKeyForDisplay(await gatewayContext(A.id))).toBe(KEY_A);
    expect(epayKeyForDisplay(await gatewayContext(B.id))).toBe(KEY_B);
    expect(epayKeyForDisplay(await gatewayContext(OWNER.id))).toBe(OWNER_ENV_KEY);

    const rowB = await prisma.integrationConfig.findUniqueOrThrow({ where: { ownerId_provider: { ownerId: B.id, provider: "epay" } } });
    // A altera a sua EPay → a de B fica exatamente igual
    await updateEPayCredentials(A.id, { secretKey: "sk_test_AAAA_new_key_for_tests" });
    expect(await prisma.integrationConfig.findUniqueOrThrow({ where: { ownerId_provider: { ownerId: B.id, provider: "epay" } } })).toEqual(rowB);
    // A desativa a EPay → B continua ativa
    await setGatewayEnabled(A.id, "epay", false);
    expect((await getActivePaymentProviders(A.id)).map((p) => p.id)).toEqual([]);
    expect((await getActivePaymentProviders(B.id)).map((p) => p.id)).toEqual(["epay"]);

    // B guarda credenciais E2Payments → nada muda na conta proprietária
    const ownerRowsBefore = await prisma.integrationConfig.findMany({ where: { ownerId: OWNER.id } });
    calls = [];
    await updateE2Credentials(B.id, { clientId: "client-b", clientSecret: "secret-b-0123456789", mpesaWalletId: "123456" });
    expect(await prisma.integrationConfig.findMany({ where: { ownerId: OWNER.id } })).toEqual(ownerRowsBefore);
    expect(process.env.EPAY_SECRET_KEY).toBe(OWNER_ENV_KEY);

    // respostas da aba Integrações nunca contêm segredos
    for (const u of [A, B, OWNER]) {
      const json = JSON.stringify(await listGateways(u.id));
      for (const secret of [KEY_A, KEY_B, OWNER_ENV_KEY, "sk_test_AAAA_new_key_for_tests", "secret-b-0123456789"]) expect(json).not.toContain(secret);
    }
    // o administrador vê só estados das integrações de cada conta
    const detail = JSON.stringify(await getUserDetail(OWNER, B.id));
    expect(detail).not.toContain("secret-b-0123456789");
    expect(detail).not.toContain("client-b");
  });

  it("conta sem integração configurada nunca usa as credenciais do proprietário", async () => {
    // a conta proprietária tem EPay pela variável de ambiente; A não configurou nada
    expect((await getActivePaymentProviders(OWNER.id)).map((p) => p.id)).toEqual(["epay"]);
    expect(await getActivePaymentProviders(A.id)).toEqual([]);
    // variáveis E2Payments também são só da conta proprietária
    process.env.E2PAYMENTS_CLIENT_ID = "owner-id";
    process.env.E2PAYMENTS_CLIENT_SECRET = "owner-secret-0123456789";
    process.env.E2PAYMENTS_MPESA_WALLET_ID = "999999";
    const a = await listGateways(A.id);
    expect(a.find((g) => g.id === "e2payments")?.configured).toBe(false);
    expect(a.find((g) => g.id === "epay")?.configured).toBe(false);
    const pa = await productFor(SA);
    calls = [];
    const r = await submitCheckout(pa.primaryCheckout.slug!, { name: "Comprador", email: "c@ex.co.mz", idempotencyKey: idem() });
    expect(r.kind).toBe("payments_unavailable");
    expect(calls).toHaveLength(0); // nenhum pedido ao gateway com as credenciais do proprietário
    expect(await prisma.order.count({ where: { ownerId: A.id } })).toBe(0);
  });
});

// ───────────────────────── F — Proprietário ─────────────────────────
describe("F. conta proprietária", () => {
  it("mantém o acesso e as credenciais; administra; existe no máximo um OWNER; papel nunca vem do registo", async () => {
    expect(canAdminister(OWNER)).toBe(true);
    expect(canAdminister(A)).toBe(false);
    expect(epayKeyForDisplay(await gatewayContext(OWNER.id))).toBe(OWNER_ENV_KEY);
    // o registo público nunca cria OWNER nem conta aprovada, mesmo que o pedido traga esses campos
    const forged = await registerUser({ email: "escalada@ex.co.mz", name: "Escalada", password: "password-123456", ...({ role: "OWNER", status: "APPROVED" } as object) });
    expect(forged).toMatchObject({ role: "USER", status: "PENDING_APPROVAL" });
    // a base de dados recusa um segundo OWNER
    await expect(createUser({ email: "dono2@ex.co.mz", name: "Dono 2", password: "password-123456" }, { role: "OWNER", status: "APPROVED" })).rejects.toThrow();
    // aprovar, rejeitar, banir e desbanir
    const u = await registerUser({ email: "ciclo@ex.co.mz", name: "Ciclo", password: "password-123456" });
    for (const action of ["approve", "ban", "unban", "reject"] as const) await applyAdminAction(OWNER, u.id, action);
    expect((await prisma.adminAuditLog.findMany({ where: { targetUserId: u.id }, orderBy: { createdAt: "asc" } })).map((h) => h.action)).toEqual(["approve", "ban", "unban", "reject"]);
    const o = await adminOverview(OWNER);
    expect(o).toMatchObject({ total: 5, pending: 1, rejected: 1 });
    expect(JSON.stringify(o)).not.toContain(OWNER_ENV_KEY);
  });
});

// ───────────────────────── G — Pagamentos ─────────────────────────
describe("G. pagamentos e avisos encaminhados para a conta certa", () => {
  async function startPurchase(owner: AuthUser, s: Scope) {
    const p = await productFor(s, `Ebook de ${owner.name}`);
    const r = await submitCheckout(p.primaryCheckout.slug!, { name: "Comprador", email: "comprador@ex.co.mz", idempotencyKey: idem() });
    expect(r.kind).toBe("payment_started");
    const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: (r as { token: string }).token }, include: { payments: true } });
    return { order, payment: order.payments[0] };
  }

  it("cobra com a chave da conta dona do checkout; aviso válido confirma só essa venda; repetição não duplica", async () => {
    await enableEPayFor(A, KEY_A);
    calls = [];
    const { order, payment } = await startPurchase(A, SA);
    expect(order.ownerId).toBe(A.id);
    // o pedido à EPay foi autenticado com a chave de A (nunca a do proprietário)
    expect(calls[0].headers.authorization).toBe(`Bearer ${KEY_A}`);
    const body = { id: payment.externalId, external_reference: payment.idempotencyKey, status: "paid", amount: "500.00", fee: "10.00", currency: "MZN" };
    const s1 = epaySigned(body, KEY_A);
    expect((await handleProviderWebhook("epay", s1.raw, s1.headers)).result).toBe("processed");
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid).toMatchObject({ status: "APPROVED", ownerId: A.id, feeCents: 1000 });
    expect(await prisma.paymentEvent.findMany({ where: { orderId: order.id } })).toMatchObject([{ ownerId: A.id }]);
    // notificação só para a conta dona da venda
    expect(await prisma.notification.findMany({ where: { type: "SALE_CONFIRMED" }, select: { userId: true } })).toEqual([{ userId: A.id }]);
    // repetição do mesmo aviso
    const again = await handleProviderWebhook("epay", s1.raw, s1.headers);
    expect(again.result).toBe("duplicate");
    expect(await prisma.orderAuditLog.count({ where: { orderId: order.id, toStatus: "APPROVED" } })).toBe(1);
  });

  it("aviso assinado com a chave de OUTRA conta (ou sem assinatura válida) nunca confirma a venda", async () => {
    await enableEPayFor(A, KEY_A);
    await enableEPayFor(B, KEY_B);
    const { order, payment } = await startPurchase(A, SA);
    const body = { id: payment.externalId, external_reference: payment.idempotencyKey, status: "paid", amount: "500.00", fee: "0.00", currency: "MZN" };
    // B tenta confirmar a venda de A assinando com a sua própria chave
    const forged = epaySigned(body, KEY_B);
    expect((await handleProviderWebhook("epay", forged.raw, forged.headers)).status).toBe(401);
    // assinatura com a chave do proprietário também não serve
    const ownerSigned = epaySigned(body, OWNER_ENV_KEY);
    expect((await handleProviderWebhook("epay", ownerSigned.raw, ownerSigned.headers)).status).toBe(401);
    // sem assinatura
    expect((await handleProviderWebhook("epay", forged.raw, new Headers({ "content-type": "application/json" }))).status).toBe(401);
    // pagamento desconhecido
    const unknown = epaySigned({ ...body, id: "01jdesconhecido" }, KEY_A);
    expect((await handleProviderWebhook("epay", unknown.raw, unknown.headers)).status).toBe(404);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect(await prisma.notification.count({ where: { type: "SALE_CONFIRMED" } })).toBe(0);
    // fornecedor sem avisos documentados (E2Payments) ou desconhecido
    expect((await handleProviderWebhook("e2payments", forged.raw, forged.headers)).status).toBe(404);
    expect((await handleProviderWebhook("stripe", forged.raw, forged.headers)).status).toBe(404);
  });

  it("a conta proprietária continua a vender com a sua EPay (variável de ambiente) — compatibilidade", async () => {
    calls = [];
    const { order, payment } = await startPurchase(OWNER, SO);
    expect(order.ownerId).toBe(OWNER.id);
    expect(calls[0].headers.authorization).toBe(`Bearer ${OWNER_ENV_KEY}`);
    const s = epaySigned({ id: payment.externalId, external_reference: payment.idempotencyKey, status: "paid", amount: "500.00", fee: "0.00", currency: "MZN" }, OWNER_ENV_KEY);
    expect((await handleProviderWebhook("epay", s.raw, s.headers)).result).toBe("processed");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("APPROVED");
  });
});
