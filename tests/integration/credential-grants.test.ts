// Partilha das credenciais de pagamento do administrador (sessão 21): autorização por utilizador e gateway,
// credenciais nunca expostas, venda/faturamento/notificações na conta do vendedor, revogação só para novos
// pagamentos, isolamento entre contas. A API da EPay é simulada no formato da documentação (como em epay.test.ts).
import { createHmac } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { checkoutSchema, productSchema } from "@/server/validation/schemas";
import { createProduct } from "../helpers/products";
import { createCheckout } from "@/server/services/checkouts";
import { submitCheckout } from "@/server/services/purchase";
import { handleProviderWebhook } from "@/server/payments/webhooks";
import { credentialOwnerOf, getActivePaymentProviders } from "@/server/payments/registry";
import { listGateways, updateEPayCredentials } from "@/server/services/integrations";
import { getDashboardData } from "@/server/services/metrics";
import { lifetimeRevenueCents } from "@/server/services/dashboard-extras";
import { grantCredentials, listGrantsForAdmin, listSharedForUser, requestGrantRemoval, revokeGrant, searchGrantableUsers } from "@/server/services/credential-grants";
import { resolveRange } from "@/lib/dates";
import { centsToDecimalString } from "@/lib/money";
import { scopeOf } from "@/server/scope";
import type { AuthUser } from "@/server/auth/service";

const ADMIN_KEY = "sk_test_51ADMINkey_only_for_tests";
const JOAO_KEY = "sk_test_51JOAOkey_only_for_tests";

interface Call { url: string; headers: Record<string, string>; body: Record<string, unknown> | null }
let calls: Call[] = [];
let n = 0;
beforeAll(() => {
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const body = init.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, headers, body });
    const id = `01jshare${String(n++).padStart(17, "0")}`;
    return new Response(
      JSON.stringify({ id, status: "pending", amount: centsToDecimalString(Math.round(Number(body?.amount) * 100)), fee: null, net_amount: null, currency: "MZN", description: "x", external_reference: body?.external_reference, payment_type: null, payment_url: `https://checkout.epay.co.mz/p/${id}`, created_at: "2026-10-12T10:15:00+02:00" }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  });
});
afterAll(() => vi.unstubAllGlobals());

let ADMIN: AuthUser;
let JOAO: AuthUser;
let MARIA: AuthUser;
let PEDRO: AuthUser;
beforeEach(async () => {
  await resetTestDb();
  ADMIN = await testOwner();
  JOAO = await testSeller("joao@ntp.local", "João");
  MARIA = await testSeller("maria@ntp.local", "Maria");
  PEDRO = await testSeller("pedro@ntp.local", "Pedro");
  calls = [];
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  // credenciais EPay do administrador (conta proprietária)
  process.env.EPAY_SECRET_KEY = ADMIN_KEY;
  process.env.APP_BASE_URL = "https://loja.exemplo.co.mz";
});
afterEach(() => {
  delete process.env.EPAY_SECRET_KEY;
  for (const k of ["E2PAYMENTS_CLIENT_ID", "E2PAYMENTS_CLIENT_SECRET", "E2PAYMENTS_MPESA_WALLET_ID"]) delete process.env[k];
  process.env.APP_BASE_URL = "http://localhost:3000";
});

let seq = 0;
async function sellerCheckout(user: AuthUser, price = "500,00") {
  const S = scopeOf(user.id, false);
  const p = await createProduct(productSchema.parse({ name: `Produto de ${user.name}`, description: "Produto do vendedor", type: "COURSE", priceCents: price, currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://conteudo.exemplo/curso" }), S);
  const c = await createCheckout(checkoutSchema.parse({ name: "Checkout", productId: p.id, offerId: p.offers[0].id, title: "Curso", buttonText: "Pagar", primaryColor: "#C8F135", backgroundColor: "#0B0C0E", successTitle: "Ok", successMessage: "Ok", isActive: "on" }), S);
  return { product: p, checkout: c };
}
const buy = (publicId: string) => submitCheckout(publicId, { name: "Cliente", email: `cliente${seq}@exemplo.co.mz`, idempotencyKey: `idem${Date.now()}${seq++}abcdefgh` });

function epayCallback(payment: { externalId: string | null; idempotencyKey: string; amountCents: number }, secret: string) {
  const raw = JSON.stringify({ id: payment.externalId, external_reference: payment.idempotencyKey, status: "paid", amount: centsToDecimalString(payment.amountCents), fee: "0.00", net_amount: centsToDecimalString(payment.amountCents), currency: "MZN", payment_type: "mpesa", paid_at: "2026-10-12T10:17:20+02:00" });
  return handleProviderWebhook("epay", raw, new Headers({ "content-type": "application/json", "X-EducavelPay-Signature": createHmac("sha256", secret).update(raw).digest("hex") }));
}

describe("partilha das credenciais do administrador", () => {
  it("sem autorização: o utilizador continua com as suas próprias credenciais (e sem as do administrador)", async () => {
    expect(await getActivePaymentProviders(JOAO.id)).toEqual([]);
    expect((await updateEPayCredentials(JOAO.id, { secretKey: JOAO_KEY })).ok).toBe(true);
    await prisma.integrationConfig.update({ where: { ownerId_provider: { ownerId: JOAO.id, provider: "epay" } }, data: { enabled: true } });
    const [p] = await getActivePaymentProviders(JOAO.id);
    expect(p.id).toBe("epay");
    expect(credentialOwnerOf(p)).toBeNull();
    const { checkout } = await sellerCheckout(JOAO);
    expect((await buy(checkout.publicId)).kind).toBe("payment_started");
    expect(calls.at(-1)!.headers.authorization).toBe(`Bearer ${JOAO_KEY}`);
    expect((await prisma.payment.findFirstOrThrow()).credentialOwnerId).toBeNull();
  });

  it("EPay concedida ao João: cobra com a chave do administrador; venda, faturamento e notificações ficam no João", async () => {
    const r = await grantCredentials(ADMIN, JOAO.id, ["epay"]);
    expect(r.created).toEqual(["epay"]);
    // o João vê a integração como ativa, sem qualquer credencial
    const shared = await listSharedForUser(JOAO.id);
    expect(shared).toEqual([expect.objectContaining({ provider: "epay", name: "EPay", available: true, removalRequestedAt: null })]);
    const exposed = JSON.stringify({ shared, gateways: await listGateways(JOAO.id) });
    expect(exposed).not.toContain(ADMIN_KEY);
    expect(exposed).not.toContain("51ADMIN");
    expect(exposed).not.toContain(ADMIN.id);

    const [p] = await getActivePaymentProviders(JOAO.id);
    expect(credentialOwnerOf(p)).toBe(ADMIN.id);
    const { product, checkout } = await sellerCheckout(JOAO);
    const started = await buy(checkout.publicId);
    expect(started.kind).toBe("payment_started");
    expect(calls.at(-1)!.headers.authorization).toBe(`Bearer ${ADMIN_KEY}`);
    const order = await prisma.order.findFirstOrThrow({ include: { payments: true, items: true } });
    expect(order.ownerId).toBe(JOAO.id);
    expect(order.items[0].productId).toBe(product.id);
    expect(order.payments[0].credentialOwnerId).toBe(ADMIN.id);

    // aviso assinado com a chave do João (que não é a usada) é rejeitado; com a do administrador é aceite
    expect((await epayCallback(order.payments[0], JOAO_KEY)).status).toBe(401);
    expect((await epayCallback(order.payments[0], ADMIN_KEY)).status).toBe(200);
    const paid = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paid.status).toBe("APPROVED");
    expect(paid.ownerId).toBe(JOAO.id);
    // faturamento e notificações do João; nada para o administrador
    expect(await lifetimeRevenueCents(scopeOf(JOAO.id, false))).toBe(0); // chave sk_test_ → pagamento de teste, fora da receita
    const d = await getDashboardData({ scope: scopeOf(JOAO.id, false), range: resolveRange({ preset: "today" }, "Africa/Maputo"), defaultCurrency: "MZN", tz: "Africa/Maputo" });
    expect(d.recent.map((o) => o.id)).toContain(order.id);
    expect(await prisma.notification.count({ where: { userId: JOAO.id, type: "SALE_CONFIRMED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: ADMIN.id, type: "SALE_CONFIRMED" } })).toBe(0);
    expect(await prisma.order.count({ where: { ownerId: ADMIN.id } })).toBe(0);
    // registos sem segredos
    const logs = JSON.stringify(await prisma.integrationLog.findMany());
    expect(logs).not.toContain(ADMIN_KEY);
  });

  it("credenciais próprias ativas têm prioridade sobre as partilhadas", async () => {
    await grantCredentials(ADMIN, JOAO.id, ["epay"]);
    await updateEPayCredentials(JOAO.id, { secretKey: JOAO_KEY });
    await prisma.integrationConfig.update({ where: { ownerId_provider: { ownerId: JOAO.id, provider: "epay" } }, data: { enabled: true } });
    const [p] = await getActivePaymentProviders(JOAO.id);
    expect(credentialOwnerOf(p)).toBeNull();
  });

  it("E2Payments concedida a outra utilizadora funciona da mesma forma; quem não tem autorização não a usa", async () => {
    delete process.env.EPAY_SECRET_KEY;
    process.env.E2PAYMENTS_CLIENT_ID = "cliente-admin-123";
    process.env.E2PAYMENTS_CLIENT_SECRET = "segredo-admin-abcdef";
    process.env.E2PAYMENTS_MPESA_WALLET_ID = "123456";
    await prisma.integrationConfig.create({ data: { ownerId: ADMIN.id, provider: "e2payments", enabled: true, status: "CONFIGURED", verifiedAt: new Date() } });
    expect((await getActivePaymentProviders(ADMIN.id)).map((p) => p.id)).toEqual(["e2payments"]);

    await grantCredentials(ADMIN, MARIA.id, ["e2payments"]);
    const [p] = await getActivePaymentProviders(MARIA.id);
    expect(p.id).toBe("e2payments");
    expect(credentialOwnerOf(p)).toBe(ADMIN.id);
    expect(await getActivePaymentProviders(PEDRO.id)).toEqual([]);
    expect(await getActivePaymentProviders(JOAO.id)).toEqual([]);
    const shared = JSON.stringify(await listSharedForUser(MARIA.id));
    expect(shared).not.toContain("segredo-admin");
    expect(shared).not.toContain("cliente-admin");
  });

  it("revogar impede novos pagamentos sem afetar os que já estavam em processamento nem outros utilizadores", async () => {
    await grantCredentials(ADMIN, JOAO.id, ["epay"]);
    await grantCredentials(ADMIN, MARIA.id, ["epay"]);
    const { checkout } = await sellerCheckout(JOAO);
    expect((await buy(checkout.publicId)).kind).toBe("payment_started");
    const pending = await prisma.payment.findFirstOrThrow();

    const grant = (await listGrantsForAdmin(ADMIN)).find((g) => g.grantee.id === JOAO.id)!;
    await revokeGrant(ADMIN, grant.id);
    expect(await getActivePaymentProviders(JOAO.id)).toEqual([]);
    expect((await buy(checkout.publicId)).kind).toBe("payments_unavailable");
    expect(await listSharedForUser(JOAO.id)).toEqual([]);
    // a Maria continua autorizada
    expect((await getActivePaymentProviders(MARIA.id)).length).toBe(1);
    // o pagamento iniciado antes da revogação continua a ser confirmado com a chave do administrador
    expect((await epayCallback(pending, ADMIN_KEY)).status).toBe(200);
    expect((await prisma.order.findFirstOrThrow({ where: { ownerId: JOAO.id } })).status).toBe("APPROVED");
    const grants = await listGrantsForAdmin(ADMIN);
    expect(grants.find((g) => g.id === grant.id)).toMatchObject({ status: "REVOKED", revokedAt: expect.any(Date) });
    // reconceder cria uma nova autorização (o histórico fica)
    await grantCredentials(ADMIN, JOAO.id, ["epay"]);
    expect(await prisma.paymentCredentialGrant.count({ where: { granteeId: JOAO.id } })).toBe(2);
  });

  it("pedido de remoção: regista, avisa o administrador e não revoga; ninguém usa autorizações de outros", async () => {
    await grantCredentials(ADMIN, JOAO.id, ["epay", "e2payments"]);
    const [epayGrant] = (await listSharedForUser(JOAO.id)).filter((s) => s.provider === "epay");
    await expect(requestGrantRemoval(PEDRO.id, epayGrant.id)).rejects.toThrow();
    await requestGrantRemoval(JOAO.id, epayGrant.id);
    await requestGrantRemoval(JOAO.id, epayGrant.id); // repetido: sem segunda notificação
    expect((await listSharedForUser(JOAO.id)).find((s) => s.provider === "epay")!.removalRequestedAt).toBeInstanceOf(Date);
    expect(await prisma.notification.count({ where: { userId: ADMIN.id, type: "ACCOUNT_ALERT" } })).toBe(1);
    expect((await getActivePaymentProviders(JOAO.id)).map((p) => p.id)).toContain("epay"); // ainda ativa até o administrador revogar
    expect((await listGrantsForAdmin(ADMIN)).filter((g) => g.removalRequestedAt)).toHaveLength(1);
  });

  it("só o administrador concede e revoga; não pode conceder a si próprio nem a contas por aprovar", async () => {
    await expect(grantCredentials(JOAO, PEDRO.id, ["epay"])).rejects.toThrow();
    await expect(searchGrantableUsers(JOAO, "")).rejects.toThrow();
    await expect(listGrantsForAdmin(JOAO)).rejects.toThrow();
    await expect(grantCredentials(ADMIN, ADMIN.id, ["epay"])).rejects.toThrow();
    await expect(grantCredentials(ADMIN, JOAO.id, ["paypal"])).rejects.toThrow();
    const pendingUser = await prisma.user.create({ data: { email: "pend@ntp.local", name: "Pendente", passwordHash: "x", status: "PENDING_APPROVAL" } });
    await expect(grantCredentials(ADMIN, pendingUser.id, ["epay"])).rejects.toThrow();
    await grantCredentials(ADMIN, JOAO.id, ["epay"]);
    const g = (await listGrantsForAdmin(ADMIN))[0];
    await expect(revokeGrant(JOAO, g.id)).rejects.toThrow();
    // uma autorização ativa por utilizador e método
    expect((await grantCredentials(ADMIN, JOAO.id, ["epay"])).existing).toEqual(["epay"]);
    expect((await searchGrantableUsers(ADMIN, "maria")).map((u) => u.email)).toEqual(["maria@ntp.local"]);
  });
});
