// Preparação para tráfego pago (sessão 22): pagamentos em simultâneo com o fornecedor de TESTE (sem gateways
// reais). Cobre os 10 cenários obrigatórios: compras simultâneas, produtos diferentes, dados não misturados, sem
// vendas duplicadas, atualização da página, falha de rede, aviso repetido, browser fechado, confirmação demorada e
// regresso ao checkout. A lógica de pagamento não foi alterada: estes testes verificam o comportamento existente.
import { createHmac } from "crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct } from "../helpers/products";
import { submitCheckout } from "@/server/services/purchase";
import { getPaymentView, refreshPaymentStatus } from "@/server/services/payment-flow";
import { handleProviderWebhook } from "@/server/payments/webhooks";
import { scopeOf, type Scope } from "@/server/scope";

const SECRET = "segredo-concorrencia-testes";
beforeAll(() => {
  process.env.NTP_ENABLE_TEST_PROVIDER = "true";
  process.env.TEST_PROVIDER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
});

let S: Scope;
let OTHER: Scope;
beforeEach(async () => {
  await resetTestDb();
  S = scopeOf((await testOwner()).id, false);
  OTHER = scopeOf((await testSeller("outra@ntp.local")).id, false);
});

const form = (name: string, price: string) => productSchema.parse({ name, description: "Produto para testes de concorrência.", type: "COURSE", priceCents: price, currency: "MZN", status: "PUBLISHED" });
let seq = 0;
const newKey = () => `conc${Date.now().toString(36)}${seq++}abcdefghij`;
const buyer = (i: number, over: Record<string, string> = {}) => ({ name: `Cliente ${i}`, email: `cliente${i}@exemplo.co.mz`, phone: `84${String(100000 + i).slice(-6)}7`, method: "mpesa", idempotencyKey: newKey(), ...over });

async function paidWebhook(orderId: string) {
  const p = await prisma.payment.findFirstOrThrow({ where: { orderId } });
  const raw = JSON.stringify({ eventId: `ev_${p.id}_paid`, externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  return handleProviderWebhook("teste-local", raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }));
}
const started = (r: Awaited<ReturnType<typeof submitCheckout>>) => {
  if (r.kind !== "payment_started") throw new Error(`esperado payment_started, obtido ${r.kind}`);
  return r.token;
};

describe("pagamentos em simultâneo (fornecedor de teste)", () => {
  it("1–3. muitos clientes e dois produtos ao mesmo tempo: encomendas próprias, preços certos e dados não misturados", async () => {
    const a = await createProduct(form("Curso A", "500,00"), S);
    const b = await createProduct(form("Curso B", "750,00"), S);
    const jobs = Array.from({ length: 40 }, (_, i) => ({ i, p: i % 2 ? b : a }));
    const results = await Promise.all(jobs.map(({ i, p }) => submitCheckout(p.primaryCheckout.slug!, buyer(i))));
    const tokens = results.map(started);
    expect(new Set(tokens).size).toBe(40);
    for (const { i, p } of jobs) {
      const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: tokens[i] }, include: { customer: true, items: true, payments: true } });
      expect(o.items[0].productId).toBe(p.id);
      expect(o.totalCents).toBe(p.offers[0].priceCents);
      expect(o.customer.email).toBe(`cliente${i}@exemplo.co.mz`);
      expect(o.customer.name).toBe(`Cliente ${i}`);
      expect(o.payments).toHaveLength(1);
      expect(o.ownerId).toBe(S.ownerId);
    }
    // a página de estado de um cliente não mostra dados de outro (nem nome nem email)
    const view = JSON.stringify(await getPaymentView(tokens[0]));
    expect(view).not.toContain("cliente1@exemplo.co.mz");
    expect(view).not.toContain("Cliente 1");
  });

  it("o mesmo email em dois separadores ao mesmo tempo: as duas compras são registadas, sem erro", async () => {
    const a = await createProduct(form("Curso", "500,00"), S);
    const r = await Promise.all([submitCheckout(a.primaryCheckout.slug!, buyer(1)), submitCheckout(a.primaryCheckout.slug!, buyer(1))]);
    expect(r.map((x) => x.kind)).toEqual(["payment_started", "payment_started"]);
    expect(await prisma.customer.count({ where: { ownerId: S.ownerId } })).toBe(1);
  });

  it("4–5. duplo clique / atualização da página: a mesma chave nunca cria uma segunda encomenda nem cobrança", async () => {
    const a = await createProduct(form("Curso", "500,00"), S);
    const input = buyer(7);
    const r = await Promise.all(Array.from({ length: 15 }, () => submitCheckout(a.primaryCheckout.slug!, { ...input })));
    const tokens = new Set(r.filter((x) => x.kind === "payment_started").map((x) => (x as { token: string }).token));
    expect(tokens.size).toBe(1);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.payment.count()).toBe(1);
    // reenviar depois (página recarregada com a tentativa guardada) devolve a mesma encomenda
    expect(started(await submitCheckout(a.primaryCheckout.slug!, { ...input }))).toBe([...tokens][0]);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("6. falha de rede com o gateway: fica em estado incerto, sem nova cobrança automática; repetir não cobra outra vez", async () => {
    const a = await createProduct(form("Curso", "500,00"), S);
    const input = buyer(9, { phone: "841234569" }); // telefone terminado em 9 → erro de rede no fornecedor de teste
    const t = started(await submitCheckout(a.primaryCheckout.slug!, input));
    const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: t }, include: { payments: true } });
    expect(o.status).toBe("PENDING");
    expect(o.payments).toHaveLength(1);
    expect((await getPaymentView(t))!.uncertain).toBe(true);
    await refreshPaymentStatus(o.id);
    expect(started(await submitCheckout(a.primaryCheckout.slug!, input))).toBe(t);
    expect(await prisma.payment.count()).toBe(1);
  });

  it("7–8. aviso recebido várias vezes em simultâneo e com o browser fechado: uma única venda, uma entrega", async () => {
    const a = await createProduct(form("Curso", "500,00"), S);
    const t = started(await submitCheckout(a.primaryCheckout.slug!, buyer(3)));
    const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: t } });
    // ninguém consulta a página: só o aviso do gateway
    const outs = await Promise.all(Array.from({ length: 6 }, () => paidWebhook(o.id)));
    expect(outs.every((x) => x.status === 200)).toBe(true);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: o.id }, include: { delivery: true, auditLogs: true } });
    expect(after.status).toBe("APPROVED");
    expect(after.delivery).not.toBeNull();
    expect(after.auditLogs.filter((l) => l.toStatus === "APPROVED")).toHaveLength(1);
    expect(await prisma.notification.count({ where: { orderId: o.id, type: "SALE_CONFIRMED" } })).toBe(1);
    expect((await getPaymentView(t))!.state).toBe("paid");
  });

  it("9–10. confirmação demorada não é dada como falhada; o comprador volta e vê o estado certo", async () => {
    const a = await createProduct(form("Curso", "500,00"), S);
    const input = buyer(5);
    const t = started(await submitCheckout(a.primaryCheckout.slug!, input));
    const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: t } });
    // várias consultas ao gateway enquanto o comprador ainda não confirmou no telemóvel
    for (let i = 0; i < 5; i++) {
      await prisma.payment.updateMany({ where: { orderId: o.id }, data: { lastCheckedAt: null } });
      await refreshPaymentStatus(o.id);
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.id } })).status).toBe("PENDING");
    expect((await getPaymentView(t))!.state).toBe("pending");
    // volta ao checkout e carrega outra vez em pagar (tentativa guardada): a mesma encomenda, sem nova cobrança
    expect(started(await submitCheckout(a.primaryCheckout.slug!, input))).toBe(t);
    await paidWebhook(o.id);
    expect((await getPaymentView(t))!.state).toBe("paid");
  });

  it("isolamento: compras simultâneas em lojas diferentes ficam cada uma na sua conta", async () => {
    const mine = await createProduct(form("Meu curso", "500,00"), S);
    const theirs = await createProduct(form("Curso da outra loja", "300,00"), OTHER);
    await Promise.all(Array.from({ length: 20 }, (_, i) => submitCheckout((i % 2 ? theirs : mine).primaryCheckout.slug!, buyer(i))));
    expect(await prisma.order.count({ where: { ownerId: S.ownerId } })).toBe(10);
    expect(await prisma.order.count({ where: { ownerId: OTHER.ownerId } })).toBe(10);
    expect(await prisma.order.count({ where: { ownerId: S.ownerId, items: { some: { productId: theirs.id } } } })).toBe(0);
    expect(await prisma.customer.count({ where: { ownerId: OTHER.ownerId, orders: { some: { ownerId: S.ownerId } } } })).toBe(0);
  });
});
