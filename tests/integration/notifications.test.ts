// Notificações (canal interno + push), idempotência dos eventos de pagamento, reembolsos e relatórios financeiros.
// Pagamentos pelo fornecedor de TESTE local; o envio push é simulado (setPushSender) exceto no teste de cifra.
import { createECDH, createHmac, randomBytes } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import webpush from "web-push";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — biblioteca sem tipos (dependência da web-push)
import ece from "http_ece";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner } from "../helpers/db";
import { createUser } from "@/server/auth/service";
import { productSchema } from "@/server/validation/schemas";
import { createProduct } from "../helpers/products";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { applyPaymentStatus } from "@/server/payments/confirm";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { getVapidKeys, processPushOutbox, resetVapidCache, setPushSender, type PushSender, MAX_ATTEMPTS } from "@/server/notifications/push";
import {
  confirmReceipt,
  deliveryStatus,
  listNotifications,
  markAllRead,
  markRead,
  revokeDevice,
  runDailySummary,
  savePrefs,
  sendTestNotification,
  subscribeDevice,
  unreadCount,
} from "@/server/notifications/service";
import { csvCell, getFinanceReport, listTransactions, recordRefund } from "@/server/services/finance";
import { financeKpis } from "@/server/services/finance-logic";
import { changeOrderStatus } from "@/server/services/orders";
import { isAllowedPushEndpoint } from "@/lib/notifications";
import { resolveRange } from "@/lib/dates";
import { scopeOf, type Scope } from "@/server/scope";
import type { AuthUser } from "@/server/auth/service";

const SECRET = "segredo-apenas-para-testes";
const TZ = "Africa/Maputo";
let sent: { endpoint: string; payload: string }[] = [];
let nextResult: Awaited<ReturnType<PushSender>> = { ok: true, statusCode: 201 };
const fakeSender: PushSender = async (t, payload) => {
  sent.push({ endpoint: t.endpoint, payload });
  return nextResult;
};

beforeAll(() => {
  process.env.NTP_ENABLE_TEST_PROVIDER = "true";
  process.env.TEST_PROVIDER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
  setPushSender(null);
});
let OWNER: AuthUser;
let S: Scope; // âmbito real da conta proprietária de teste
let D: Scope; // âmbito de demonstração da mesma conta
beforeEach(async () => {
  await resetTestDb();
  OWNER = await testOwner();
  S = scopeOf(OWNER.id, false);
  D = scopeOf(OWNER.id, true);
  resetVapidCache();
  sent = [];
  nextResult = { ok: true, statusCode: 201 };
  setPushSender(fakeSender);
});
afterEach(() => setPushSender(null));

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;
const b64 = (n: number) => randomBytes(n).toString("base64url");
/** Subscrição com chaves no formato real do navegador (P-256 + segredo de 16 bytes). */
function browserSubscription(host = "fcm.googleapis.com") {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return { ecdh, auth, json: { endpoint: `https://${host}/fcm/send/${b64(24)}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } } };
}

/** a = conta dona das vendas criadas nos testes (OWNER); b = outra conta aprovada (não pode receber alertas de a). */
async function users() {
  const a = OWNER;
  const b = await createUser({ email: "socio@ntp.local", name: "Outro vendedor", password: "password-123456" }, { role: "USER", status: "APPROVED" });
  return { a, b };
}

async function product(name = "Ebook Vendas", price = "500,00") {
  return createProduct(productSchema.parse({ name, description: `${name} para testes`, type: "EBOOK", priceCents: price, currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://conteudo.exemplo/x" }), S);
}

async function startPurchase(phone = "841234567") {
  const p = await product();
  const r = await submitCheckout(p.primaryCheckout.slug!, { name: "Ana Compradora", email: "ana@exemplo.co.mz", phone, method: "mpesa", idempotencyKey: key() });
  expect(r.kind).toBe("payment_started");
  const token = (r as { token: string }).token;
  const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  return { product: p, order, payment: order.payments[0] };
}

function webhookFor(payment: { id: string; externalId: string | null; idempotencyKey: string; amountCents: number }, state: "paid" | "failed", eventId = `ev_${payment.id}_${state}`) {
  const raw = JSON.stringify({ eventId, externalId: payment.externalId, reference: payment.idempotencyKey, status: state, amountCents: payment.amountCents, currency: "MZN", feeCents: 0 });
  return handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
}

describe("1–2. venda confirmada: uma única notificação, sem duplicados", () => {
  it("confirmação pelo servidor cria 1 notificação de venda por utilizador e 1 envio por dispositivo", async () => {
    const { a, b } = await users();
    const sub = browserSubscription();
    expect(await subscribeDevice(a.id, sub.json, "Mozilla/5.0 (Linux; Android 14) Chrome/130.0")).toMatchObject({ ok: true });
    const { order, payment } = await startPurchase();
    // pagamento pendente não é venda
    expect(await prisma.notification.count({ where: { type: "SALE_CONFIRMED" } })).toBe(0);
    // só a conta dona da venda é notificada (nunca outra conta)
    expect(await prisma.notification.count({ where: { type: "PAYMENT_PENDING", orderId: order.id } })).toBe(1);

    expect((await webhookFor(payment, "paid")).status).toBe(200);
    const sales = await prisma.notification.findMany({ where: { type: "SALE_CONFIRMED" } });
    expect(sales).toHaveLength(1);
    expect(sales[0].userId).toBe(a.id);
    expect(await prisma.notification.count({ where: { userId: b.id } })).toBe(0);
    // BARÃO: título fixo, valor real em MT; nunca o produto nem o cliente
    expect(sales[0].title).toBe("👑 Venda aprovada!");
    expect(sales[0].body).toContain("500,00 MT");
    expect(sales[0].body).not.toContain("Ebook Vendas");
    expect(sales[0].body).toMatch(/Barão|império|negócio/);
    expect(sales[0].url).toBe(`/pedidos/${order.id}`);
    expect(await prisma.pushDelivery.count({ where: { notification: { type: "SALE_CONFIRMED" } } })).toBe(1);

    // envio pela fila persistente (fora de um pedido HTTP o envio fica na fila — nada se perde)
    const out = await processPushOutbox();
    expect(out.sent).toBeGreaterThanOrEqual(1);
    const salePush = sent.find((s) => JSON.parse(s.payload).url === `/pedidos/${order.id}` && JSON.parse(s.payload).title === "👑 Venda aprovada!" && JSON.parse(s.payload).kind === "sale");
    expect(salePush).toBeTruthy();
    expect(JSON.parse(salePush!.payload)).toMatchObject({ title: "👑 Venda aprovada!", d: expect.any(String), t: expect.any(String) });
  });

  it("eventos repetidos (webhook duplicado, novo id, consulta de estado) não duplicam notificações nem faturamento", async () => {
    await users();
    const sub = browserSubscription();
    const u = await prisma.user.findFirstOrThrow();
    await subscribeDevice(u.id, sub.json, null);
    const { order, payment } = await startPurchase();
    await webhookFor(payment, "paid");
    await webhookFor(payment, "paid"); // mesmo evento
    await webhookFor(payment, "paid", "outro-id-do-mesmo-pagamento"); // outro evento, mesmo pagamento
    const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    await applyPaymentStatus("teste-local", { externalId: fresh.externalId, reference: fresh.idempotencyKey, state: "paid", amountCents: fresh.amountCents, currency: "MZN", feeCents: 0, rawStatus: "paid" }, "status-check");
    expect(await prisma.notification.count({ where: { type: "SALE_CONFIRMED", orderId: order.id } })).toBe(1);
    expect(await prisma.pushDelivery.count({ where: { notification: { type: "SALE_CONFIRMED" } } })).toBe(1);
    expect(await prisma.orderAuditLog.count({ where: { orderId: order.id, toStatus: "APPROVED" } })).toBe(1);
    await processPushOutbox();
    await processPushOutbox();
    expect(sent.filter((s) => JSON.parse(s.payload).title === "👑 Venda aprovada!").length).toBe(1);
  });
});

describe("3. pendentes e falhados não contam como vendas", () => {
  it("pagamento pendente notifica 'pendente' e falhado notifica 'não concluído'; nenhum entra no faturamento", async () => {
    await users();
    const pend = await startPurchase("841234563");
    const fail = await startPurchase("841234564");
    await webhookFor(fail.payment, "failed");
    expect(await prisma.notification.count({ where: { type: "PAYMENT_FAILED", orderId: fail.order.id } })).toBe(1);
    const n = await prisma.notification.findFirstOrThrow({ where: { type: "PAYMENT_FAILED" } });
    expect(n.body).toBe(`O pagamento do pedido ${fail.order.code} não foi concluído. (teste)`);
    expect(await prisma.notification.count({ where: { type: "SALE_CONFIRMED" } })).toBe(0);
    const p = await prisma.notification.findFirstOrThrow({ where: { type: "PAYMENT_PENDING", orderId: pend.order.id } });
    expect(p.title).toBe("Pagamento pendente.");
    expect(p.body).toContain(`Pedido: ${pend.order.code}`);
  });

  it("modelo financeiro: pendentes/falhados/cancelados ficam fora; venda conta pela data de confirmação", () => {
    const w = { from: new Date("2026-10-01T00:00:00Z"), to: new Date("2026-10-02T00:00:00Z") };
    const base = { currency: "MZN" as const, feeCents: 0, gateway: "epay", items: [{ productId: "p1", productName: "Ebook", totalCents: 1000 }] };
    const orders = [
      { ...base, id: "a", status: "APPROVED" as const, totalCents: 1000, createdAt: new Date("2026-09-30T23:00:00Z"), approvedAt: new Date("2026-10-01T08:00:00Z") },
      { ...base, id: "b", status: "PENDING" as const, totalCents: 700, createdAt: new Date("2026-10-01T09:00:00Z"), approvedAt: null },
      { ...base, id: "c", status: "DECLINED" as const, totalCents: 300, createdAt: new Date("2026-10-01T10:00:00Z"), approvedAt: null },
      { ...base, id: "d", status: "CANCELED" as const, totalCents: 200, createdAt: new Date("2026-10-01T11:00:00Z"), approvedAt: null },
      { ...base, id: "e", status: "REFUNDED" as const, totalCents: 400, createdAt: new Date("2026-10-01T12:00:00Z"), approvedAt: new Date("2026-10-01T12:01:00Z") },
      { ...base, id: "f", status: "APPROVED" as const, currency: "EUR" as const, totalCents: 999, createdAt: new Date("2026-10-01T12:00:00Z"), approvedAt: new Date("2026-10-01T12:00:00Z") },
    ];
    const refunds = [{ orderId: "e", amountCents: 400, currency: "MZN" as const, createdAt: new Date("2026-10-01T15:00:00Z") }];
    const k = financeKpis(orders, refunds, "MZN", w);
    expect(k).toMatchObject({ grossCents: 1400, salesCount: 2, refundCents: 400, refundCount: 1, netAfterRefundsCents: 1000, pendingCount: 1, pendingCents: 700, failedCount: 1, failedCents: 300, canceledCount: 1, avgTicketCents: 700 });
    // EUR nunca é somado com MZN
    expect(financeKpis(orders, refunds, "EUR", w)).toMatchObject({ grossCents: 999, salesCount: 1, refundCents: 0 });
  });
});

describe("4. reembolsos", () => {
  async function paidOrder(provider = "epay", total = 100000) {
    const p = await product("Curso Reembolso", "1000,00");
    const c = await prisma.customer.create({ data: { email: `c${seq++}@ex.co.mz`, name: "Cliente", ownerId: OWNER.id } });
    return prisma.order.create({
      data: { code: `NTP-T${seq++}X${Date.now() % 100000}`, customerId: c.id, status: "APPROVED", source: "CHECKOUT", currency: "MZN", subtotalCents: total, totalCents: total, netCents: total, provider, externalRef: `ext_${seq}`, ownerId: OWNER.id, approvedAt: new Date(), items: { create: { productId: p.id, kind: "MAIN", description: "x", unitPriceCents: total, totalCents: total } } },
    });
  }

  it("parcial e total atualizam relatório e notificam; nunca ultrapassam o total; exige confirmação no gateway", async () => {
    await users();
    const o = await paidOrder();
    await expect(recordRefund({ orderId: o.id, amountCents: 30000, confirmedAtGateway: false }, S, "admin:x")).rejects.toThrow(/painel do gateway/);
    const r1 = await recordRefund({ orderId: o.id, amountCents: 30000, reason: "Pedido do cliente", confirmedAtGateway: true }, S, "admin:x");
    expect(r1.full).toBe(false);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("APPROVED");
    await expect(recordRefund({ orderId: o.id, amountCents: 80000, confirmedAtGateway: true }, S, "admin:x")).rejects.toThrow(/excede/);
    const r2 = await recordRefund({ orderId: o.id, amountCents: 70000, confirmedAtGateway: true }, S, "admin:x");
    expect(r2.full).toBe(true);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("REFUNDED");
    await expect(recordRefund({ orderId: o.id, amountCents: 1, confirmedAtGateway: true }, S, "admin:x")).rejects.toThrow(/pagos/);

    const refundNotes = await prisma.notification.findMany({ where: { type: "REFUND_CONFIRMED" }, orderBy: { createdAt: "asc" } });
    expect(refundNotes).toHaveLength(2); // 2 reembolsos, só para a conta dona
    expect(refundNotes[0].title).toBe("Reembolso confirmado.");
    expect(refundNotes.map((n) => n.body.replace(/\s/g, " ")).join("\n")).toContain("Valor: 300,00 MZN");

    const range = resolveRange({ preset: "today" }, TZ);
    const rep = await getFinanceReport({ scope: S, range, defaultCurrency: "MZN", tz: TZ });
    expect(rep.kpis).toMatchObject({ grossCents: 100000, refundCents: 100000, refundCount: 2, netAfterRefundsCents: 0, salesCount: 1 });
    expect(rep.daily.at(-1)).toMatchObject({ grossCents: 100000, sales: 1, refundCents: 100000, refunds: 2 });
    const tx = await listTransactions(S, range, {});
    expect(tx.rows[0]).toMatchObject({ refundState: "full", refundedCents: 100000 });
  });

  it("reembolso em modo demonstração (estado REEMBOLSADO) fica registado e não notifica", async () => {
    await users();
    const p = await product("Demo", "100,00");
    await prisma.product.update({ where: { id: p.id }, data: { isDemo: true } });
    const c = await prisma.customer.create({ data: { email: "d@ex.co.mz", name: "Demo", isDemo: true, ownerId: OWNER.id } });
    const o = await prisma.order.create({ data: { code: "NTP-DEMO1234", customerId: c.id, status: "APPROVED", source: "DEMO", currency: "MZN", subtotalCents: 10000, totalCents: 10000, netCents: 10000, isDemo: true, ownerId: OWNER.id, approvedAt: new Date(), items: { create: { productId: p.id, kind: "MAIN", description: "x", unitPriceCents: 10000, totalCents: 10000 } } } });
    await changeOrderStatus(o.id, "REFUNDED", D, "admin:x");
    expect(await prisma.refund.findMany({ where: { orderId: o.id } })).toMatchObject([{ amountCents: 10000, isDemo: true }]);
    expect(await prisma.notification.count()).toBe(0);
  });

  it("5. vendas separadas por gateway; filtros, pesquisa e ordenação das transações; CSV seguro", async () => {
    await paidOrder("epay", 50000);
    await paidOrder("epay", 20000);
    await paidOrder("e2payments", 30000);
    const range = resolveRange({ preset: "today" }, TZ);
    const rep = await getFinanceReport({ scope: S, range, defaultCurrency: "MZN", tz: TZ });
    expect(rep.gateways).toEqual([
      { gateway: "epay", revenueCents: 70000, sales: 2 },
      { gateway: "e2payments", revenueCents: 30000, sales: 1 },
    ]);
    expect((await listTransactions(S, range, { gateway: "e2payments" })).rows).toHaveLength(1);
    expect((await listTransactions(S, range, { status: "PENDING" })).total).toBe(0);
    const byAmount = await listTransactions(S, range, { sort: "amount", dir: "asc" });
    expect(byAmount.rows.map((r) => r.totalCents)).toEqual([20000, 30000, 50000]);
    expect((await listTransactions(S, range, { pageSize: 2, page: 2 })).rows).toHaveLength(1);
    const one = byAmount.rows[0];
    expect((await listTransactions(S, range, { q: one.code })).rows.map((r) => r.id)).toEqual([one.id]);
    // período sem dados
    expect((await listTransactions(S, resolveRange({ preset: "custom", from: "2020-01-01", to: "2020-01-02" }, TZ), {})).total).toBe(0);
    // CSV: fórmulas neutralizadas e separadores escapados
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell(12)).toBe("12");
  });
});

describe("6–8. dispositivos, revogação e notificação de teste", () => {
  it("subscrição válida é guardada; endpoints fora dos serviços de push e chaves inválidas são recusados", async () => {
    const { a } = await users();
    expect(isAllowedPushEndpoint("https://web.push.apple.com/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isAllowedPushEndpoint("https://evil.example.com/fcm.googleapis.com")).toBe(false);
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest")).toBe(false);
    const ok = await subscribeDevice(a.id, browserSubscription("web.push.apple.com").json, "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit Version/17.4 Mobile Safari/604.1");
    expect(ok).toMatchObject({ ok: true });
    const d = await prisma.pushSubscription.findFirstOrThrow();
    expect(d.deviceLabel).toBe("iPhone · Safari");
    expect(d.vapidKey).toBe((await getVapidKeys())!.publicKey);
    expect(await subscribeDevice(a.id, { endpoint: "https://evil.example.com/x", keys: browserSubscription().json.keys }, null)).toMatchObject({ ok: false });
    expect(await subscribeDevice(a.id, { endpoint: browserSubscription().json.endpoint, keys: { p256dh: "curto", auth: "x" } }, null)).toMatchObject({ ok: false });
  });

  it("revogar: o dispositivo deixa de receber e os envios pendentes são cancelados", async () => {
    const { a } = await users();
    const s = browserSubscription();
    await subscribeDevice(a.id, s.json, null);
    const { payment } = await startPurchase();
    await webhookFor(payment, "paid");
    const sub = await prisma.pushSubscription.findFirstOrThrow();
    expect(await revokeDevice(a.id, { id: sub.id })).toBe(true);
    expect(await prisma.pushDelivery.count({ where: { status: "PENDING" } })).toBe(0);
    await processPushOutbox();
    expect(sent).toHaveLength(0);
    // a notificação interna continua disponível
    expect(await unreadCount(a.id)).toBeGreaterThan(0);
    expect((await sendTestNotification(a.id, s.json.endpoint)).kind).toBe("no_device");
  });

  it("teste: distingue 'aceite pelo serviço de push' de 'recebida no dispositivo'", async () => {
    const { a } = await users();
    const s = browserSubscription();
    await subscribeDevice(a.id, s.json, null);
    const r = await sendTestNotification(a.id, s.json.endpoint);
    expect(r).toMatchObject({ kind: "accepted", statusCode: 201 });
    if (r.kind !== "accepted") throw new Error();
    expect(await deliveryStatus(a.id, r.deliveryId)).toMatchObject({ status: "SENT", receivedAt: null });
    const payload = JSON.parse(sent[0].payload);
    expect(await confirmReceipt(r.deliveryId, "token-errado-token-errado")).toBe(false);
    expect(await confirmReceipt(r.deliveryId, payload.t)).toBe(true);
    expect((await deliveryStatus(a.id, r.deliveryId))?.receivedAt).toBeInstanceOf(Date);
    expect(await confirmReceipt(r.deliveryId, payload.t)).toBe(false); // só uma vez
  });

  it("cifra real (RFC 8291 aes128gcm) e cabeçalho VAPID: só o dispositivo decifra o conteúdo", async () => {
    const keys = (await getVapidKeys())!;
    const s = browserSubscription();
    const req = webpush.generateRequestDetails({ endpoint: s.json.endpoint, keys: s.json.keys }, JSON.stringify({ title: "Olá" }), {
      vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
      TTL: 60,
    });
    expect(req.headers["Content-Encoding"]).toBe("aes128gcm");
    expect(String(req.headers.Authorization)).toMatch(/^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=/);
    expect(String(req.headers.Authorization)).toContain(keys.publicKey);
    const plain = ece.decrypt(req.body, { version: "aes128gcm", privateKey: s.ecdh, authSecret: s.auth.toString("base64url") });
    expect(JSON.parse(plain.toString())).toEqual({ title: "Olá" });
    // a chave privada nunca é guardada em texto simples
    const row = await prisma.pushConfig.findUniqueOrThrow({ where: { id: "default" } });
    expect(row.privateKeyEnc).not.toContain(keys.privateKey);
    resetVapidCache();
    expect((await getVapidKeys())!.publicKey).toBe(keys.publicKey); // estável entre execuções
  });
});

describe("12–13. falhas de entrega: a notificação interna mantém-se", () => {
  it("410 revoga a subscrição; 500 volta a tentar com limite; o painel continua a ter a notificação", async () => {
    const { a } = await users();
    await subscribeDevice(a.id, browserSubscription().json, null);
    nextResult = { ok: false, statusCode: 503, error: "indisponível" };
    const { payment } = await startPurchase();
    await webhookFor(payment, "paid");
    await processPushOutbox();
    const d = await prisma.pushDelivery.findFirstOrThrow({ where: { notification: { type: "SALE_CONFIRMED" } } });
    expect(d).toMatchObject({ status: "PENDING", attempts: 1, lastStatusCode: 503 });
    expect(d.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    for (let i = 1; i < MAX_ATTEMPTS; i++) {
      await prisma.pushDelivery.updateMany({ data: { nextAttemptAt: new Date(0) } });
      await processPushOutbox();
    }
    expect(await prisma.pushDelivery.findUniqueOrThrow({ where: { id: d.id } })).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
    // serviço de push indica subscrição inexistente
    nextResult = { ok: false, statusCode: 410, error: "Gone" };
    const t = await sendTestNotification(a.id, (await prisma.pushSubscription.findFirstOrThrow()).endpoint);
    expect(t).toMatchObject({ kind: "rejected", statusCode: 410, revoked: true });
    expect((await prisma.pushSubscription.findFirstOrThrow()).revokedAt).toBeInstanceOf(Date);
    const list = await listNotifications(a.id);
    expect(list.rows.find((n) => n.type === "SALE_CONFIRMED")).toMatchObject({ push: "failed" });
    expect(list.unread).toBeGreaterThanOrEqual(2);
  });

  it("preferências: categoria desligada não cria notificação; push desligado mantém só o canal interno", async () => {
    const { a, b } = await users();
    await subscribeDevice(a.id, browserSubscription().json, null);
    await subscribeDevice(b.id, browserSubscription().json, null);
    await savePrefs(a.id, { pushEnabled: false, sales: true, pending: false, failed: true, refunds: true, dailySummary: false });
    await savePrefs(b.id, { pushEnabled: true, sales: false, pending: true, failed: true, refunds: true, dailySummary: false });
    const { payment } = await startPurchase();
    await webhookFor(payment, "paid");
    expect(await prisma.notification.count({ where: { userId: a.id, type: "SALE_CONFIRMED" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: a.id, type: "PAYMENT_PENDING" } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: b.id, type: "SALE_CONFIRMED" } })).toBe(0);
    expect(await prisma.pushDelivery.count({ where: { notification: { userId: a.id } } })).toBe(0);
  });
});

describe("14. resumo diário", () => {
  it("resume o dia anterior (fuso da plataforma) uma única vez e só para quem o ativou", async () => {
    const { a, b } = await users();
    await savePrefs(a.id, { pushEnabled: true, sales: true, pending: true, failed: true, refunds: true, dailySummary: true });
    const p = await product("Ebook Resumo", "250,00");
    const c = await prisma.customer.create({ data: { email: "r@ex.co.mz", name: "R", ownerId: OWNER.id } });
    // 2026-10-12 22:30 em Maputo = 20:30 UTC
    for (const at of ["2026-10-12T20:30:00Z", "2026-10-12T08:00:00Z", "2026-10-12T22:30:00Z"]) {
      await prisma.order.create({ data: { code: `NTP-R${seq++}ABC`, customerId: c.id, status: "APPROVED", source: "CHECKOUT", currency: "MZN", subtotalCents: 25000, totalCents: 25000, netCents: 25000, provider: "epay", ownerId: OWNER.id, approvedAt: new Date(at), createdAt: new Date(at), items: { create: { productId: p.id, kind: "MAIN", description: "x", unitPriceCents: 25000, totalCents: 25000 } } } });
    }
    const early = await runDailySummary(new Date("2026-10-13T03:00:00Z")); // 05:00 em Maputo: ainda cedo
    expect(early.ran).toBe(false);
    const r = await runDailySummary(new Date("2026-10-13T06:00:00Z"));
    expect(r).toMatchObject({ ran: true, day: "2026-10-12", created: 1 });
    const n = await prisma.notification.findFirstOrThrow({ where: { type: "DAILY_SUMMARY" } });
    expect(n.userId).toBe(a.id);
    // 22:30 UTC de 12/10 já é dia 13 em Maputo → fica de fora
    expect(n.body.replace(/[\u00a0\u202f]/g, " ")).toContain("2 venda(s) confirmada(s) · bruto 500,00 MZN");
    expect(n.body).toContain("Mais vendidos: Ebook Resumo (2)");
    expect((await runDailySummary(new Date("2026-10-13T09:00:00Z"))).ran).toBe(false);
    expect(await prisma.notification.count({ where: { userId: b.id } })).toBe(0);
  });

  it("período 'Ontem' usa os limites do dia no fuso da plataforma", () => {
    const r = resolveRange({ preset: "yesterday" }, TZ, new Date("2026-10-13T00:30:00Z")); // 02:30 de 13/10 em Maputo
    expect(r.days).toEqual(["2026-10-12"]);
    expect(r.from.toISOString()).toBe("2026-10-11T22:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-10-12T22:00:00.000Z");
    expect(r.label).toBe("Ontem");
  });
});

describe("15. isolamento entre utilizadores", () => {
  it("um utilizador não lê, marca, testa nem remove notificações/dispositivos de outro", async () => {
    const { a, b } = await users();
    const s = browserSubscription();
    await subscribeDevice(a.id, s.json, null);
    const t = await sendTestNotification(a.id, s.json.endpoint);
    if (t.kind !== "accepted") throw new Error();
    const note = await prisma.notification.findFirstOrThrow({ where: { userId: a.id } });
    expect((await listNotifications(b.id)).total).toBe(0);
    expect(await markRead(b.id, note.id)).toBe(false);
    expect(await markAllRead(b.id)).toBe(0);
    expect(await unreadCount(a.id)).toBe(1);
    expect(await deliveryStatus(b.id, t.deliveryId)).toBeNull();
    const sub = await prisma.pushSubscription.findFirstOrThrow();
    expect(await revokeDevice(b.id, { id: sub.id })).toBe(false);
    expect(await revokeDevice(b.id, { endpoint: s.json.endpoint })).toBe(false);
    expect((await sendTestNotification(b.id, s.json.endpoint)).kind).toBe("no_device");
    // o mesmo navegador a iniciar sessão como B passa o endpoint para B (um endpoint = um utilizador)
    await subscribeDevice(b.id, s.json, null);
    expect((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: s.json.endpoint } })).userId).toBe(b.id);
    expect(await markRead(a.id, note.id)).toBe(true);
    expect(await unreadCount(a.id)).toBe(0);
  });
});
