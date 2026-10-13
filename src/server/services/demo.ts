// Dados de demonstração: isolados por `isDemo = true`, nunca criados automaticamente em produção
// e removíveis a qualquer momento. Valores fictícios — não representam faturação real.
import type { Currency, OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { newCheckoutPublicId, newOrderCode } from "@/lib/ids";
import type { FunnelGraph } from "@/lib/funnels/types";
import { createFunnel } from "./funnels";
import { ensurePrimaryCheckout } from "./primary-checkout";

export async function clearDemoData() {
  await prisma.$transaction([
    prisma.funnelRun.deleteMany({ where: { isDemo: true } }),
    prisma.order.deleteMany({ where: { isDemo: true } }),
    prisma.customer.deleteMany({ where: { isDemo: true } }),
    prisma.coupon.deleteMany({ where: { isDemo: true } }),
    prisma.checkoutSession.deleteMany({ where: { isDemo: true } }),
    prisma.checkout.deleteMany({ where: { isDemo: true } }),
    prisma.funnel.deleteMany({ where: { isDemo: true } }),
    prisma.product.deleteMany({ where: { isDemo: true } }),
    prisma.analyticsEvent.deleteMany({ where: { isDemo: true } }),
  ]);
}

export async function demoDataCounts() {
  const [products, orders, customers, coupons, funnels, checkouts] = await Promise.all([
    prisma.product.count({ where: { isDemo: true } }),
    prisma.order.count({ where: { isDemo: true } }),
    prisma.customer.count({ where: { isDemo: true } }),
    prisma.coupon.count({ where: { isDemo: true } }),
    prisma.funnel.count({ where: { isDemo: true } }),
    prisma.checkout.count({ where: { isDemo: true } }),
  ]);
  return { products, orders, customers, coupons, funnels, checkouts };
}

// gerador determinístico para resultados reproduzíveis
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Eva", "Fábio", "Gabriela", "Hugo", "Inês", "João", "Larissa", "Marco", "Nádia", "Otávio", "Paula", "Rui", "Sofia", "Tiago"];
const LAST = ["Silva", "Santos", "Oliveira", "Costa", "Pereira", "Almeida", "Ferreira", "Rodrigues", "Martins", "Gomes"];

export async function seedDemoData(now = new Date(), currency: Currency = "MZN") {
  await clearDemoData();
  const rand = rng(42);
  const dayMs = 86_400_000;

  const mk = (name: string, description: string, type: "EBOOK" | "COURSE" | "DIGITAL", priceCents: number, imageUrl: string | null) =>
    prisma.product.create({
      data: {
        name,
        description,
        type,
        category: "Demonstração",
        status: "PUBLISHED",
        imageUrl,
        isDemo: true,
        offers: { create: { name: "Preço principal", priceCents, currency, isDefault: true } },
      },
      include: { offers: true },
    });

  const guide = await mk("Guia Digital de Exemplo", "Produto fictício utilizado para validar a interface.", "EBOOK", 197_00, null);
  const course = await mk("Curso Premium de Demonstração", "Curso fictício para testar ofertas de maior valor.", "COURSE", 448_00, null);
  const upsell = await mk("Kit Complementar de Demonstração", "Produto complementar fictício usado como upsell.", "DIGITAL", 97_00, null);
  const downsell = await mk("Mini Guia Alternativo de Demonstração", "Oferta alternativa fictícia usada como downsell.", "EBOOK", 47_00, null);
  await prisma.product.create({
    data: {
      name: "Rascunho de Demonstração",
      description: "Produto fictício em rascunho para testar estados.",
      type: "PDF",
      status: "DRAFT",
      isDemo: true,
      offers: { create: { name: "Preço principal", priceCents: 29_00, currency, isDefault: true } },
    },
  });

  const checkoutGuide = await prisma.checkout.create({
    data: {
      publicId: newCheckoutPublicId(),
      name: "Checkout — Guia Digital (demo)",
      productId: guide.id,
      offerId: guide.offers[0].id,
      title: "Guia Digital de Exemplo",
      description: "Acesso imediato ao guia completo em PDF. Produto fictício de demonstração.",
      buttonText: "Comprar agora",
      isDemo: true,
    },
  });
  const checkoutCourse = await prisma.checkout.create({
    data: {
      publicId: newCheckoutPublicId(),
      name: "Checkout — Curso Premium (demo)",
      productId: course.id,
      offerId: course.offers[0].id,
      title: "Curso Premium de Demonstração",
      description: "Curso fictício com módulos de exemplo.",
      collectPhone: true,
      isDemo: true,
    },
  });

  const graph: FunnelGraph = {
    nodes: [
      { key: "start", type: "START", label: "Início", position: { x: 0, y: 160 }, config: {} },
      { key: "sales", type: "SALES_PAGE", label: "Página de vendas", position: { x: 240, y: 160 }, config: { productId: guide.id, url: "https://exemplo.invalid/guia" } },
      { key: "checkout", type: "CHECKOUT", label: "Checkout principal", position: { x: 480, y: 160 }, config: { checkoutId: checkoutGuide.id } },
      { key: "approved", type: "PURCHASE_APPROVED", label: "Compra aprovada", position: { x: 720, y: 160 }, config: {} },
      {
        key: "upsell",
        type: "UPSELL",
        label: "Upsell — Kit",
        position: { x: 960, y: 160 },
        config: {
          productId: upsell.id,
          offerId: upsell.offers[0].id,
          headline: "Adicione o Kit Complementar",
          body: "Complemento fictício de demonstração por um valor especial.",
          acceptText: "Sim, quero adicionar",
          declineText: "Não, obrigado",
        },
      },
      {
        key: "downsell",
        type: "DOWNSELL",
        label: "Downsell — Mini Guia",
        position: { x: 1200, y: 320 },
        config: {
          productId: downsell.id,
          offerId: downsell.offers[0].id,
          headline: "Que tal o Mini Guia?",
          body: "Uma alternativa fictícia mais acessível.",
          acceptText: "Sim, quero o Mini Guia",
          declineText: "Não, terminar",
        },
      },
      { key: "thanks", type: "THANK_YOU", label: "Obrigado", position: { x: 1440, y: 160 }, config: { title: "Compra de demonstração concluída", message: "Nenhum valor foi cobrado — isto é uma simulação." } },
    ],
    edges: [
      { key: "e1", source: "start", target: "sales", sourceHandle: "next" },
      { key: "e2", source: "sales", target: "checkout", sourceHandle: "next" },
      { key: "e3", source: "checkout", target: "approved", sourceHandle: "next" },
      { key: "e4", source: "approved", target: "upsell", sourceHandle: "next" },
      { key: "e5", source: "upsell", target: "thanks", sourceHandle: "accept" },
      { key: "e6", source: "upsell", target: "downsell", sourceHandle: "decline" },
      { key: "e7", source: "downsell", target: "thanks", sourceHandle: "accept" },
      { key: "e8", source: "downsell", target: "thanks", sourceHandle: "decline" },
    ],
  };
  const funnel = await createFunnel({ name: "Funil de Demonstração — Guia", description: "Checkout → upsell → downsell → obrigado" }, true, graph);
  await prisma.funnel.update({ where: { id: funnel.id }, data: { status: "ACTIVE" } });
  await prisma.checkout.update({ where: { id: checkoutGuide.id }, data: { funnelId: funnel.id } });

  // Cupões de teste
  const coupon = await prisma.coupon.create({
    data: { code: "TESTE10", description: "10% de desconto (demonstração)", type: "PERCENT", percentOff: 10, maxUses: 100, isDemo: true },
  });
  await prisma.coupon.createMany({
    data: [
      { code: "EXPIRADO", description: "Cupão expirado (demonstração)", type: "PERCENT", percentOff: 20, endsAt: new Date(now.getTime() - 5 * dayMs), isDemo: true },
      { code: "ESGOTADO", description: "Limite atingido (demonstração)", type: "PERCENT", percentOff: 15, maxUses: 1, usesCount: 1, isDemo: true },
      { code: "CURSO50", description: "50,00 de desconto só no curso (demonstração)", type: "FIXED", amountOffCents: 50_00, currency, appliesToAll: false, isDemo: true },
    ],
  });
  const curso50 = await prisma.coupon.findUniqueOrThrow({ where: { code_isDemo: { code: "CURSO50", isDemo: true } } });
  await prisma.couponProduct.create({ data: { couponId: curso50.id, productId: course.id } });

  // Clientes
  const customers = [] as { id: string }[];
  for (let i = 0; i < 36; i++) {
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 7) % LAST.length];
    customers.push(
      await prisma.customer.create({
        data: {
          name: `${first} ${last}`,
          email: `${first.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}.${last.toLowerCase()}${i}@exemplo.invalid`,
          isDemo: true,
          createdAt: new Date(now.getTime() - 31 * dayMs),
        },
      }),
    );
  }

  type Spec = { status: OrderStatus; items: { p: typeof guide; kind: "MAIN" | "UPSELL" }[]; checkoutId: string; daysAgo: number };
  const specs: Spec[] = [];
  // 42 aprovados: 30 × 197,00 + 12 × (448,00 + 97,00) = 12.450,00
  for (let i = 0; i < 30; i++) specs.push({ status: "APPROVED", items: [{ p: guide, kind: "MAIN" }], checkoutId: checkoutGuide.id, daysAgo: Math.floor(rand() * 29) });
  for (let i = 0; i < 12; i++) specs.push({ status: "APPROVED", items: [{ p: course, kind: "MAIN" }, { p: upsell, kind: "UPSELL" }], checkoutId: checkoutCourse.id, daysAgo: Math.floor(rand() * 29) });
  // estados (Pedidos B–E)
  for (let i = 0; i < 3; i++) specs.push({ status: "PENDING", items: [{ p: guide, kind: "MAIN" }], checkoutId: checkoutGuide.id, daysAgo: i });
  specs.push({ status: "DECLINED", items: [{ p: guide, kind: "MAIN" }], checkoutId: checkoutGuide.id, daysAgo: 4 });
  specs.push({ status: "REFUNDED", items: [{ p: course, kind: "MAIN" }], checkoutId: checkoutCourse.id, daysAgo: 9 });
  specs.push({ status: "CANCELED", items: [{ p: guide, kind: "MAIN" }], checkoutId: checkoutGuide.id, daysAgo: 12 });

  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const createdAt = new Date(now.getTime() - s.daysAgo * dayMs - Math.floor(rand() * 8 * 3_600_000) - 60_000);
    const items = s.items.map((it) => ({
      productId: it.p.id,
      offerId: it.p.offers[0].id,
      kind: it.kind,
      description: `${it.p.name} — Preço principal`,
      unitPriceCents: it.p.offers[0].priceCents,
      quantity: 1,
      totalCents: it.p.offers[0].priceCents,
    }));
    const subtotal = items.reduce((a, it) => a + it.totalCents, 0);
    const data: Prisma.OrderUncheckedCreateInput = {
      code: newOrderCode(),
      customerId: customers[i % customers.length].id,
      checkoutId: s.checkoutId,
      funnelId: s.checkoutId === checkoutGuide.id ? funnel.id : null,
      status: s.status,
      source: "DEMO",
      currency,
      subtotalCents: subtotal,
      discountCents: 0,
      totalCents: subtotal,
      feeCents: 0,
      netCents: subtotal,
      isDemo: true,
      notes: "Pedido fictício de demonstração.",
      createdAt,
      approvedAt: s.status === "APPROVED" || s.status === "REFUNDED" ? createdAt : null,
      refundedAt: s.status === "REFUNDED" ? new Date(createdAt.getTime() + dayMs) : null,
      canceledAt: s.status === "CANCELED" ? createdAt : null,
      items: { create: items },
    };
    const created = await prisma.order.create({ data });
    // Reembolso fictício registado (relatórios contam reembolsos pela data de registo)
    if (s.status === "REFUNDED") {
      await prisma.refund.create({ data: { orderId: created.id, amountCents: subtotal, currency, reason: "Reembolso de demonstração", actor: "demo", isDemo: true, createdAt: new Date(createdAt.getTime() + dayMs) } });
    }
  }

  // Sessões de checkout fictícias para permitir calcular conversão
  const sessions: Prisma.CheckoutSessionCreateManyInput[] = [];
  for (let d = 0; d < 30; d++) {
    const n = 4 + Math.floor(rand() * 6);
    for (let k = 0; k < n; k++) {
      sessions.push({
        checkoutId: k % 3 === 0 ? checkoutCourse.id : checkoutGuide.id,
        isDemo: true,
        status: "OPEN",
        createdAt: new Date(now.getTime() - d * dayMs - Math.floor(rand() * 10 * 3_600_000)),
      });
    }
  }
  await prisma.checkoutSession.createMany({ data: sessions });

  // cada produto de demonstração fica com o seu checkout principal (os dois checkouts criados acima passam a principais)
  for (const p of await prisma.product.findMany({ where: { isDemo: true }, select: { id: true } })) await ensurePrimaryCheckout(p.id);

  return { products: 5, checkouts: 2, funnelId: funnel.id, couponId: coupon.id, orders: specs.length };
}
