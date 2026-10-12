import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb } from "../helpers/db";
import { productSchema, couponSchema, checkoutSchema } from "@/server/validation/schemas";
import { createProduct, updateProduct, getProduct, listProducts, setProductStatus, duplicateProduct, DomainError } from "@/server/services/products";
import { createCheckout, getPublicCheckout, checkoutUrl, setCheckoutActive } from "@/server/services/checkouts";
import { createCoupon, evaluateCouponCode, DuplicateCodeError } from "@/server/services/coupons";
import { createManualOrder, listOrders, changeOrderStatus } from "@/server/services/orders";
import { createFunnel, saveFunnel, activateFunnel, getFunnelRecord, toGraph } from "@/server/services/funnels";
import { submitCheckout, decideRun, getRunView, startCheckoutSession } from "@/server/services/purchase";
import { seedDemoData, clearDemoData } from "@/server/services/demo";
import { getDashboardData } from "@/server/services/metrics";
import { resolveRange } from "@/lib/dates";

const productInput = (over: Record<string, unknown> = {}) =>
  productSchema.parse({
    name: "Guia Digital de Exemplo",
    description: "Produto fictício utilizado para validar a interface.",
    type: "EBOOK",
    priceCents: "197,00",
    currency: "MZN",
    status: "PUBLISHED",
    ...over,
  });

const checkoutInput = (productId: string, offerId: string, over: Record<string, unknown> = {}) =>
  checkoutSchema.parse({
    name: "Checkout teste",
    productId,
    offerId,
    title: "Guia Digital",
    buttonText: "Comprar",
    primaryColor: "#C8F135",
    backgroundColor: "#0B0C0E",
    successTitle: "Obrigado",
    successMessage: "Obrigado pela compra",
    allowCoupons: "on",
    isActive: "on",
    ...over,
  });

beforeEach(async () => {
  await resetTestDb();
});

describe("produtos", () => {
  it("cria, edita e persiste com precisão monetária", async () => {
    const p = await createProduct(productInput({ status: "DRAFT" }), false);
    expect(p.offers[0]).toMatchObject({ priceCents: 19700, currency: "MZN", isDefault: true });
    await updateProduct(p.id, productInput({ name: "Guia Editado", priceCents: "247,90", status: "DRAFT" }), false);
    const reloaded = await getProduct(p.id, false);
    expect(reloaded.name).toBe("Guia Editado");
    expect(reloaded.offers[0].priceCents).toBe(24790);
  });

  it("lista com pesquisa, filtro e isolamento demo/real", async () => {
    await createProduct(productInput({ name: "Alpha Curso", type: "COURSE" }), false);
    await createProduct(productInput({ name: "Beta Ebook" }), false);
    await createProduct(productInput({ name: "Demo Produto" }), true);
    expect((await listProducts({ isDemo: false })).map((p) => p.name).sort()).toEqual(["Alpha Curso", "Beta Ebook"]);
    expect((await listProducts({ isDemo: false, q: "alpha" })).length).toBe(1);
    expect((await listProducts({ isDemo: false, type: "COURSE" })).length).toBe(1);
    expect((await listProducts({ isDemo: true })).map((p) => p.name)).toEqual(["Demo Produto"]);
  });

  it("arquiva, duplica e não permite editar arquivado", async () => {
    const p = await createProduct(productInput(), false);
    const copy = await duplicateProduct(p.id, false);
    expect(copy.status).toBe("DRAFT");
    await setProductStatus(p.id, "ARCHIVED", false);
    expect((await listProducts({ isDemo: false })).map((x) => x.id)).toEqual([copy.id]);
    await expect(updateProduct(p.id, productInput(), false)).rejects.toBeInstanceOf(DomainError);
  });

  it("um produto demo não é acessível no âmbito real", async () => {
    const p = await createProduct(productInput(), true);
    await expect(getProduct(p.id, false)).rejects.toThrow("não encontrado");
  });
});

describe("checkouts e links", () => {
  it("gera identificador público aleatório e link que resolve", async () => {
    const p = await createProduct(productInput(), false);
    const c1 = await createCheckout(checkoutInput(p.id, p.offers[0].id), false);
    const c2 = await createCheckout(checkoutInput(p.id, p.offers[0].id), false);
    expect(c1.publicId).toMatch(/^[A-Za-z0-9]{14}$/);
    expect(c1.publicId).not.toBe(c2.publicId);
    expect(checkoutUrl(c1.publicId, "https://app.exemplo")).toBe(`https://app.exemplo/checkout/${c1.publicId}`);
    const pub = await getPublicCheckout(c1.publicId);
    expect(pub.state).toBe("ok");
    if (pub.state === "ok") expect(pub.checkout.offer.priceCents).toBe(19700);
  });

  it("checkout desativado, produto não publicado ou id inválido ficam indisponíveis", async () => {
    const p = await createProduct(productInput(), false);
    const c = await createCheckout(checkoutInput(p.id, p.offers[0].id), false);
    await setCheckoutActive(c.id, false, false);
    expect((await getPublicCheckout(c.publicId)).state).toBe("unavailable");
    await setCheckoutActive(c.id, true, false);
    await setProductStatus(p.id, "UNPUBLISHED", false);
    expect((await getPublicCheckout(c.publicId)).state).toBe("unavailable");
    expect((await getPublicCheckout("../../etc")).state).toBe("unavailable");
  });

  it("rejeita oferta que não pertence ao produto", async () => {
    const p1 = await createProduct(productInput(), false);
    const p2 = await createProduct(productInput({ name: "Outro" }), false);
    await expect(createCheckout(checkoutInput(p1.id, p2.offers[0].id), false)).rejects.toThrow("não pertence");
  });

  it("modo real: concluir compra informa indisponibilidade e não cria pedidos", async () => {
    const p = await createProduct(productInput(), false);
    const c = await createCheckout(checkoutInput(p.id, p.offers[0].id), false);
    const sid = await startCheckoutSession(c.publicId, {});
    const invalid = await submitCheckout(c.publicId, { name: "A", email: "x" }, sid ?? undefined);
    expect(invalid.kind).toBe("invalid");
    const r = await submitCheckout(c.publicId, { name: "Ana Silva", email: "ana@exemplo.pt" }, sid ?? undefined);
    expect(r.kind).toBe("payments_unavailable");
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.checkoutSession.count({ where: { status: "SUBMITTED" } })).toBe(1);
  });
});

describe("cupões", () => {
  it("guarda, impede duplicados e valida", async () => {
    const p = await createProduct(productInput(), false);
    await createCoupon(couponSchema.parse({ code: "TESTE10", type: "PERCENT", percentOff: 10, appliesToAll: "on", isActive: "on", maxUses: "1" }), false, "America/Sao_Paulo");
    await expect(
      createCoupon(couponSchema.parse({ code: "teste10", type: "PERCENT", percentOff: 5, appliesToAll: "on", isActive: "on" }), false, "America/Sao_Paulo"),
    ).rejects.toBeInstanceOf(DuplicateCodeError);
    const r = await evaluateCouponCode("teste10", { isDemo: false, productId: p.id, currency: "MZN", subtotalCents: 19700 });
    expect(r.evaluation).toMatchObject({ ok: true, discountCents: 1970 });
    // mesmo código não existe no âmbito demo
    const d = await evaluateCouponCode("TESTE10", { isDemo: true, productId: p.id, currency: "MZN", subtotalCents: 19700 });
    expect(d.evaluation).toMatchObject({ ok: false, reason: "not_found" });
  });

  it("data final é inclusiva até ao fim do dia no fuso do negócio", async () => {
    const c = await createCoupon(couponSchema.parse({ code: "FIMDIA", type: "PERCENT", percentOff: 10, appliesToAll: "on", isActive: "on", endsAt: "2026-10-12" }), false, "America/Sao_Paulo");
    expect(c.endsAt?.toISOString()).toBe("2026-10-13T03:00:00.000Z");
  });
});

describe("pedidos", () => {
  it("pedidos manuais nunca são aprovados no modo real; filtros funcionam", async () => {
    const p = await createProduct(productInput(), false);
    const base = { productId: p.id, offerId: p.offers[0].id, customerName: "Cliente Teste", customerEmail: "c@exemplo.pt" };
    await expect(createManualOrder({ ...base, status: "APPROVED" }, false)).rejects.toThrow("confirmação");
    const o1 = await createManualOrder({ ...base, status: "PENDING" }, false);
    await createManualOrder({ ...base, status: "DECLINED", customerEmail: "outro@exemplo.pt" }, false);
    expect(o1.source).toBe("MANUAL_TEST");
    expect((await listOrders({ isDemo: false })).total).toBe(2);
    expect((await listOrders({ isDemo: false, status: "PENDING" })).total).toBe(1);
    expect((await listOrders({ isDemo: false, q: "outro@" })).total).toBe(1);
    expect((await listOrders({ isDemo: false, q: o1.code.toLowerCase() })).total).toBe(1);
    expect((await listOrders({ isDemo: false, from: new Date(Date.now() + 86400000) })).total).toBe(0);
    expect((await listOrders({ isDemo: true })).total).toBe(0);
    await expect(changeOrderStatus(o1.id, "APPROVED", false)).rejects.toThrow("processador");
    await changeOrderStatus(o1.id, "CANCELED", false);
    expect((await listOrders({ isDemo: false, status: "CANCELED" })).total).toBe(1);
  });
});

describe("funis", () => {
  it("cria com modelo padrão, guarda nós e ligações, valida antes de ativar", async () => {
    const p = await createProduct(productInput(), false);
    const c = await createCheckout(checkoutInput(p.id, p.offers[0].id), false);
    const f = await createFunnel({ name: "Funil" }, false);
    let graph = toGraph(await getFunnelRecord(f.id, false));
    expect(graph.nodes).toHaveLength(4);
    // sem checkout configurado não ativa
    const v1 = await activateFunnel(f.id, false);
    expect(v1.valid).toBe(false);
    graph = { ...graph, nodes: graph.nodes.map((n) => (n.type === "CHECKOUT" ? { ...n, config: { checkoutId: c.id } } : n)) };
    graph.nodes.push({ key: "up", type: "UPSELL", label: "Upsell", position: { x: 10, y: 20 }, config: { productId: p.id, offerId: p.offers[0].id, headline: "Leve" } });
    graph.edges = graph.edges.filter((e) => e.source !== "approved");
    graph.edges.push(
      { key: "a-up", source: "approved", target: "up", sourceHandle: "next" },
      { key: "up-acc", source: "up", target: "thanks", sourceHandle: "accept" },
      { key: "up-dec", source: "up", target: "thanks", sourceHandle: "decline" },
    );
    const saved = await saveFunnel(f.id, { name: "Funil Editado", graph }, false);
    expect(saved.validation.valid).toBe(true);
    const reopened = toGraph(await getFunnelRecord(f.id, false));
    expect(reopened.nodes.find((n) => n.key === "up")?.position).toEqual({ x: 10, y: 20 });
    expect(reopened.edges).toHaveLength(5);
    const v2 = await activateFunnel(f.id, false);
    expect(v2.valid).toBe(true);
    expect((await prisma.checkout.findUnique({ where: { id: c.id } }))?.funnelId).toBe(f.id);
    // guardar um grafo inválido num funil ativo desativa-o
    const broken = await saveFunnel(f.id, { name: "Funil Editado", graph: { ...reopened, edges: [] } }, false);
    expect(broken.deactivated).toBe(true);
  });
});

describe("demonstração ponta-a-ponta", () => {
  it("seed demo: métricas exatas, isolamento e limpeza", async () => {
    const now = new Date();
    await seedDemoData(now, "MZN");
    const tz = "America/Sao_Paulo";
    const demo = await getDashboardData({ isDemo: true, range: resolveRange({ preset: "30d" }, tz, now), defaultCurrency: "MZN", tz });
    expect(demo.kpis.grossCents).toBe(1245000);
    expect(demo.kpis.approvedCount).toBe(42);
    expect(demo.kpis.pendingCount).toBe(3);
    expect(demo.kpis.refundCount).toBe(1);
    expect(demo.kpis.conversionRate).not.toBeNull();
    const real = await getDashboardData({ isDemo: false, range: resolveRange({ preset: "30d" }, tz, now), defaultCurrency: "MZN", tz });
    expect(real.kpis.grossCents).toBe(0);
    expect(real.hasAnyOrder).toBe(false);
    await clearDemoData();
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.product.count()).toBe(0);
  });

  it("compra simulada + upsell recusado + downsell aceite; cupão aplicado", async () => {
    await seedDemoData(new Date(), "MZN");
    const checkout = await prisma.checkout.findFirstOrThrow({ where: { isDemo: true, funnelId: { not: null } } });
    const r = await submitCheckout(checkout.publicId, { name: "Ana Demo", email: "ana@exemplo.invalid", coupon: "teste10" });
    expect(r.kind).toBe("demo_approved");
    if (r.kind !== "demo_approved") return;
    const order = await prisma.order.findUniqueOrThrow({ where: { code: r.orderCode } });
    expect(order).toMatchObject({ isDemo: true, source: "DEMO", status: "APPROVED", discountCents: 1970, totalCents: 17730 });
    expect(r.runId).toBeTruthy();
    let view = await getRunView(r.runId!);
    expect(view?.node?.type).toBe("UPSELL");
    await decideRun(r.runId!, view!.node!.key, "decline");
    view = await getRunView(r.runId!);
    expect(view?.node?.type).toBe("DOWNSELL");
    await decideRun(r.runId!, view!.node!.key, "accept");
    // decisão repetida é idempotente
    await decideRun(r.runId!, "downsell", "accept");
    view = await getRunView(r.runId!);
    expect(view?.node?.type).toBe("THANK_YOU");
    const final = await prisma.order.findUniqueOrThrow({ where: { code: r.orderCode }, include: { items: true } });
    expect(final.items.map((i) => i.kind).sort()).toEqual(["DOWNSELL", "MAIN"]);
    expect(final.totalCents).toBe(17730 + 4700);
    expect((await prisma.coupon.findFirstOrThrow({ where: { code: "TESTE10", isDemo: true } })).usesCount).toBe(1);
  });

  it("aceitar upsell vai direto para obrigado", async () => {
    await seedDemoData(new Date(), "MZN");
    const checkout = await prisma.checkout.findFirstOrThrow({ where: { isDemo: true, funnelId: { not: null } } });
    const r = await submitCheckout(checkout.publicId, { name: "Bruno Demo", email: "bruno@exemplo.invalid" });
    if (r.kind !== "demo_approved") throw new Error("esperado demo_approved");
    const view = await getRunView(r.runId!);
    await decideRun(r.runId!, view!.node!.key, "accept");
    expect((await getRunView(r.runId!))?.node?.type).toBe("THANK_YOU");
  });

  it("cupões de teste: expirado, esgotado e produto não elegível", async () => {
    await seedDemoData(new Date(), "MZN");
    const checkout = await prisma.checkout.findFirstOrThrow({ where: { isDemo: true, funnelId: { not: null } } });
    for (const [code, msg] of [["EXPIRADO", "expirou"], ["ESGOTADO", "limite"], ["CURSO50", "não é válido para este produto"], ["NAOEXISTE", "não encontrado"]]) {
      const r = await submitCheckout(checkout.publicId, { name: "Ana Demo", email: "ana@exemplo.invalid", coupon: code });
      expect(r.kind).toBe("coupon_error");
      if (r.kind === "coupon_error") expect(r.message).toContain(msg);
    }
  });
});
