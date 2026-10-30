// Notificações BARÃO: venda aprovada (só o valor real, sem produto nem cliente, sem duplicados), manhã, noite e
// resumo semanal (lucro real após reembolsos, isolado por conta), rotação das mensagens e preferências.
import { createHmac } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner } from "../helpers/db";
import { createUser, type AuthUser } from "@/server/auth/service";
import { productSchema } from "@/server/validation/schemas";
import { createProduct } from "../helpers/products";
import { submitCheckout } from "@/server/services/purchase";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { recordRefund } from "@/server/services/finance";
import { processPushOutbox, setPushSender, type PushSender } from "@/server/notifications/push";
import { savePrefs, subscribeDevice } from "@/server/notifications/service";
import { baraoSlotAt, runBarao, runBaraoFor, weekStart } from "@/server/notifications/barao";
import { baraoAmount, eveningMessage, morningMessage, rotate, saleMessage, SALE_TITLE, weeklyMessage } from "@/lib/barao";
import { scopeOf, type Scope } from "@/server/scope";
import { createECDH, randomBytes } from "crypto";

const SECRET = "segredo-apenas-para-testes";
const TZ = "Africa/Maputo";
let sent: string[] = [];
const fakeSender: PushSender = async (_t, payload) => {
  sent.push(payload);
  return { ok: true, statusCode: 201 };
};
beforeAll(() => {
  process.env.NTP_ENABLE_TEST_PROVIDER = "true";
  process.env.TEST_PROVIDER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
});

let OWNER: AuthUser;
let S: Scope;
beforeEach(async () => {
  await resetTestDb();
  OWNER = await testOwner();
  S = scopeOf(OWNER.id, false);
  sent = [];
  setPushSender(fakeSender);
});
afterEach(() => setPushSender(null));

let seq = 0;
async function sale(price = "250,00", opts: { paid?: boolean; real?: boolean } = {}) {
  const p = await createProduct(productSchema.parse({ name: `Curso Secreto ${seq}`, description: "Produto de teste do Barão.", type: "EBOOK", priceCents: price, currency: "MZN", status: "PUBLISHED", deliveryUrl: "https://conteudo.exemplo/x" }), S);
  const r = await submitCheckout(p.primaryCheckout.slug!, { name: "Cliente Privado", email: `cliente${seq}@exemplo.co.mz`, phone: "841234567", method: "mpesa", idempotencyKey: `idem${Date.now()}${seq++}abcdefgh` });
  if (r.kind !== "payment_started") throw new Error(r.kind);
  const order = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token }, include: { payments: true } });
  const pay = order.payments[0];
  const status = opts.paid === false ? "failed" : "paid";
  const raw = JSON.stringify({ eventId: `ev_${pay.id}_${status}`, externalId: pay.externalId, reference: pay.idempotencyKey, status, amountCents: pay.amountCents, currency: "MZN", feeCents: 0 });
  await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
  // o fornecedor local marca os pagamentos como teste; o resumo semanal só conta vendas reais
  if (opts.real) await prisma.order.update({ where: { id: order.id }, data: { isTestPayment: false } });
  return { order, raw, sig: createHmac("sha256", SECRET).update(raw).digest("hex"), productName: p.name };
}

function device(userId: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return subscribeDevice(userId, { endpoint: `https://fcm.googleapis.com/fcm/send/${randomBytes(24).toString("base64url")}`, keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } }, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1");
}

describe("venda aprovada", () => {
  it("«👑 Venda aprovada!» com o valor real em MT; sem produto nem cliente; um único envio push", async () => {
    await device(OWNER.id);
    const { order, raw, sig, productName } = await sale("250,00");
    const n = await prisma.notification.findMany({ where: { type: "SALE_CONFIRMED" } });
    expect(n).toHaveLength(1);
    expect(n[0].title).toBe(SALE_TITLE);
    expect(n[0].body).toContain("250,00 MT");
    expect(n[0].body).not.toContain(productName);
    expect(n[0].body).not.toContain("Cliente Privado");
    expect(n[0].body).not.toContain("cliente");
    // aviso repetido do gateway: nenhuma notificação nova
    await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": sig }));
    expect(await prisma.notification.count({ where: { type: "SALE_CONFIRMED", orderId: order.id } })).toBe(1);
    await processPushOutbox();
    const pushes = sent.map((s) => JSON.parse(s)).filter((p) => p.kind === "sale");
    expect(pushes).toHaveLength(1);
    expect(pushes[0]).toMatchObject({ title: SALE_TITLE, url: `/pedidos/${order.id}` });
    expect(typeof pushes[0].ts).toBe("number");
  });

  it("pagamento falhado nunca é anunciado como venda aprovada", async () => {
    await sale("250,00", { paid: false });
    expect(await prisma.notification.count({ where: { type: "SALE_CONFIRMED" } })).toBe(0);
  });

  it("a mensagem muda a cada venda (5 variações antes de repetir)", async () => {
    const bodies = [0, 1, 2, 3, 4].map((i) => saleMessage(baraoAmount(25000, "MZN"), i, OWNER.id).body);
    expect(new Set(bodies).size).toBe(5);
    expect(saleMessage("250,00 MT", 5, OWNER.id).body).toBe(bodies[0]);
    expect(bodies.every((b) => b.includes("250,00 MT"))).toBe(true);
  });
});

describe("manhã, noite e resumo semanal", () => {
  // quarta-feira, 14 de outubro de 2026 (Maputo = UTC+2)
  const WED_MORNING = new Date("2026-10-14T05:30:00Z"); // 07:30
  const WED_NOON = new Date("2026-10-14T11:00:00Z"); // 13:00
  const WED_EVENING = new Date("2026-10-14T17:30:00Z"); // 19:30
  const SUN_EVENING = new Date("2026-10-18T17:30:00Z"); // domingo 19:30

  it("janelas no fuso de Maputo; domingo à noite é o resumo semanal", () => {
    expect(baraoSlotAt(WED_MORNING, TZ)).toEqual({ slot: "morning", day: "2026-10-14" });
    expect(baraoSlotAt(WED_NOON, TZ)).toBeNull();
    expect(baraoSlotAt(WED_EVENING, TZ)).toEqual({ slot: "evening", day: "2026-10-14" });
    expect(baraoSlotAt(SUN_EVENING, TZ)).toEqual({ slot: "weekly", day: "2026-10-18" });
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
  });

  it("uma mensagem da manhã e uma da noite por dia (sem duplicados), com push", async () => {
    await device(OWNER.id);
    expect((await runBarao(WED_MORNING)).created).toBe(1);
    expect((await runBarao(WED_MORNING)).created).toBe(0);
    expect((await runBarao(WED_NOON)).created).toBe(0);
    expect((await runBarao(WED_EVENING, { userId: OWNER.id })).created).toBe(1);
    const n = await prisma.notification.findMany({ where: { userId: OWNER.id }, orderBy: { createdAt: "asc" } });
    expect(n.map((x) => [x.type, x.title])).toEqual([
      ["MORNING_MESSAGE", "☀️ Bom dia, Barão!"],
      ["EVENING_MESSAGE", "🌙 Boa noite, Barão!"],
    ]);
    await processPushOutbox();
    expect(sent.map((s) => JSON.parse(s).kind)).toEqual(["daily", "daily"]);
  });

  it("resumo semanal: lucro real após reembolsos, só da própria conta; sem contagens nem produtos", async () => {
    const b = await createUser({ email: "outro@ntp.local", name: "Outro vendedor", password: "password-123456" }, { role: "USER", status: "APPROVED" });
    const s1 = await sale("1000,00", { real: true });
    await sale("500,00", { real: true });
    await sale("300,00"); // pagamento de teste: não conta como lucro
    await recordRefund({ orderId: s1.order.id, amountCents: 20000, reason: "Pedido do cliente", confirmedAtGateway: true }, S, "teste");
    const now = new Date(Date.now() + 60_000);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(now);
    await runBaraoFor(OWNER.id, now, { force: { slot: "weekly", day } });
    const mine = await prisma.notification.findFirstOrThrow({ where: { userId: OWNER.id, type: "WEEKLY_SUMMARY" } });
    expect(mine.title).toBe("👑 Barão, olha o teu resultado!");
    expect(mine.body).toContain("1 300,00 MT"); // 1000 + 500 − 200 de reembolso
    expect(mine.body).not.toMatch(/venda|Curso|reembolso/i);
    // a outra conta não tem vendas: mensagem motivacional sem inventar valores
    await runBaraoFor(b.id, now, { force: { slot: "weekly", day } });
    const theirs = await prisma.notification.findFirstOrThrow({ where: { userId: b.id, type: "WEEKLY_SUMMARY" } });
    expect(theirs.title).toBe("👑 Uma nova semana espera por ti, Barão");
    expect(theirs.body).not.toMatch(/MT/);
    // repetir: nada de novo
    expect((await runBaraoFor(OWNER.id, now, { force: { slot: "weekly", day } }))?.created).toBe(0);
  });

  it("respeita as preferências de cada conta", async () => {
    await savePrefs(OWNER.id, { pushEnabled: true, sales: true, pending: true, failed: true, refunds: true, dailySummary: false, morning: false, evening: true, weeklySummary: true });
    expect((await runBarao(WED_MORNING)).created).toBe(0);
    expect((await runBarao(WED_EVENING)).created).toBe(1);
  });
});

describe("rotação e textos", () => {
  it("dias seguidos nunca repetem a mensagem; o lucro aparece só às vezes e nunca quando é zero", () => {
    const days = Array.from({ length: 14 }, (_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`);
    const m = days.map((d) => morningMessage(d, "conta-1", null).body);
    for (let i = 1; i < m.length; i++) expect(m[i]).not.toBe(m[i - 1]);
    const withProfit = days.map((d) => morningMessage(d, "conta-1", { cents: 1_250_00, currency: "MZN" }).body);
    const shown = withProfit.filter((b) => b.includes("1 250,00 MT")).length;
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(days.length);
    expect(days.every((d) => !morningMessage(d, "conta-1", { cents: 0, currency: "MZN" }).body.includes("MT"))).toBe(true);
    expect(days.every((d) => eveningMessage(d, "conta-1", null).title === "🌙 Boa noite, Barão!")).toBe(true);
    expect(weeklyMessage("2026-10-12", "conta-1", { cents: -500, currency: "MZN" }).body).not.toContain("MT");
    expect(rotate(["a", "b", "c"], 3, "x")).toBe(rotate(["a", "b", "c"], 0, "x"));
    expect(baraoAmount(123456789, "MZN")).toBe("1 234 567,89 MT");
  });
});
