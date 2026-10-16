// Entrega do produto comprado (ficheiro privado, link de acesso ou página de entrega interna).
// Regras: só com encomenda PAGA (confirmada pelo processador), nunca de demonstração; o produto tem de
// fazer parte DESSA encomenda (IDs alterados no URL não dão acesso a outros produtos ou contas).
import "server-only";
import type { DeliveryMethod, Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { isValidDeliveryUrl, supportLink } from "@/lib/product-setup";

const TOKEN_RE = /^[A-Za-z0-9_-]{30,40}$/;
const ID_RE = /^[a-z0-9]{10,40}$/i;

export function deliveryPagePath(deliveryToken: string, productId: string) {
  return `/entrega/${deliveryToken}/${productId}`;
}

export interface AccessAction {
  href: string;
  external: boolean;
  /** file = descarregar o ficheiro privado; external = link de acesso (SaaS…); internal = página de entrega */
  kind: "file" | "external" | "internal";
  label: string;
}

type DeliverableProduct = { id: string; deliveryMethod: DeliveryMethod | null; deliveryUrl: string | null; deliveryFileId?: string | null };

/** Botão de acesso de um produto comprado, conforme o método de entrega escolhido pelo vendedor. */
export function accessTarget(p: DeliverableProduct, deliveryToken: string | null): AccessAction | null {
  if (p.deliveryMethod === "FILE" && p.deliveryFileId && deliveryToken) return { href: `/acesso/${deliveryToken}/ficheiro/${p.deliveryFileId}`, external: false, kind: "file", label: "Descarregar produto" };
  if (p.deliveryMethod === "EXTERNAL_LINK" && p.deliveryUrl && isValidDeliveryUrl(p.deliveryUrl)) return { href: p.deliveryUrl, external: true, kind: "external", label: "Aceder ao meu produto" };
  if (p.deliveryMethod === "INTERNAL_PAGE" && deliveryToken) return { href: deliveryPagePath(deliveryToken, p.id), external: false, kind: "internal", label: "Aceder ao meu produto" };
  return null;
}

const PRODUCT_SELECT = { id: true, name: true, imageUrl: true, deliveryMethod: true, deliveryUrl: true, deliveryFileId: true, supportWhatsApp: true, supportMessage: true } as const;

export interface PurchasedProduct {
  /** Encomenda (compra principal, upsell ou downsell) que deu direito a este produto */
  orderCode: string;
  kind: "MAIN" | "UPSELL" | "DOWNSELL" | "ORDER_BUMP";
  productId: string;
  name: string;
  imageUrl: string | null;
  action: AccessAction | null;
  support: string | null;
}

/**
 * Todos os produtos efetivamente pagos de uma compra: a compra principal e cada upsell/downsell cujo pagamento
 * foi confirmado (pendentes, falhados ou reembolsados não dão acesso). Cada produto usa o SEU método de entrega e
 * o acesso pessoal (token) da encomenda que o pagou — o download de um ficheiro valida sempre essa encomenda.
 * `anyOrderId` pode ser a compra principal ou qualquer upsell/downsell da mesma compra.
 */
export async function purchasedProducts(anyOrderId: string): Promise<{ rootOrderId: string; rootToken: string | null; ownerId: string; code: string; products: PurchasedProduct[] } | null> {
  const start = await prisma.order.findUnique({ where: { id: anyOrderId }, select: { id: true, parentOrderId: true } });
  if (!start) return null;
  const root = await prisma.order.findUnique({
    where: { id: start.parentOrderId ?? start.id },
    include: {
      delivery: { select: { token: true } },
      items: { include: { product: { select: PRODUCT_SELECT } }, orderBy: { id: "asc" } },
      upsellOrders: { where: { status: "APPROVED", isDemo: false }, orderBy: { createdAt: "asc" }, include: { delivery: { select: { token: true } }, items: { include: { product: { select: PRODUCT_SELECT } } } } },
    },
  });
  if (!root || root.isDemo || root.status !== "APPROVED") return null;
  const products: PurchasedProduct[] = [];
  const add = (order: { code: string; delivery: { token: string } | null; items: { kind: PurchasedProduct["kind"]; product: Prisma.ProductGetPayload<{ select: typeof PRODUCT_SELECT }> }[] }) => {
    for (const i of order.items) {
      if (products.some((p) => p.productId === i.product.id && p.orderCode === order.code)) continue;
      const action = accessTarget(i.product, order.delivery?.token ?? null);
      // configurações muito antigas: link guardado sem método escolhido
      const legacy = !action && !i.product.deliveryMethod && i.product.deliveryUrl && isValidDeliveryUrl(i.product.deliveryUrl) ? { href: i.product.deliveryUrl, external: true, kind: "external" as const, label: "Aceder ao meu produto" } : null;
      products.push({ orderCode: order.code, kind: i.kind, productId: i.product.id, name: i.product.name, imageUrl: i.product.imageUrl, action: action ?? legacy, support: supportLink(i.product.supportWhatsApp, i.product.supportMessage) });
    }
  };
  add(root);
  for (const u of root.upsellOrders) add(u);
  return { rootOrderId: root.id, rootToken: root.delivery?.token ?? null, ownerId: root.ownerId, code: root.code, products };
}

export async function getDeliveryPageView(deliveryToken: string, productId: string) {
  if (!TOKEN_RE.test(deliveryToken) || !ID_RE.test(productId)) return null;
  const d = await prisma.delivery.findUnique({
    where: { token: deliveryToken },
    include: { order: { select: { id: true, code: true, status: true, isDemo: true, ownerId: true, items: { select: { productId: true } } } } },
  });
  if (!d || d.order.status !== "APPROVED" || d.order.isDemo) return null;
  if (!d.order.items.some((i) => i.productId === productId)) return null;
  const product = await prisma.product.findFirst({
    // o produto tem de pertencer à mesma conta da encomenda
    where: { id: productId, ownerId: d.order.ownerId },
    include: { deliveryPage: true, files: { select: { id: true, filename: true, sizeBytes: true }, orderBy: { createdAt: "asc" } } },
  });
  if (!product) return null;
  await prisma.delivery.update({ where: { id: d.id }, data: { accessCount: { increment: 1 }, lastAccessAt: new Date() } });

  const page = product.deliveryPage;
  const fileHref = (fileId: string) => `/acesso/${deliveryToken}/ficheiro/${fileId}`;
  const mainFile = page?.fileId ? product.files.find((f) => f.id === page.fileId) ?? null : null;
  const resource = page?.resourceUrl && isValidDeliveryUrl(page.resourceUrl) ? page.resourceUrl : null;
  // Botão "ACEDER AO MEU PRODUTO": ficheiro principal → link → conteúdo desta página (por esta ordem)
  let access: { href: string; external: boolean; kind: "file" | "link" | "content" | "external" } | null = null;
  const deliveredFile = product.deliveryMethod === "FILE" && product.deliveryFileId ? product.files.find((f) => f.id === product.deliveryFileId) ?? null : null;
  if (product.deliveryMethod === "EXTERNAL_LINK" && product.deliveryUrl && isValidDeliveryUrl(product.deliveryUrl)) access = { href: product.deliveryUrl, external: true, kind: "external" };
  else if (deliveredFile) access = { href: fileHref(deliveredFile.id), external: false, kind: "file" };
  else if (mainFile) access = { href: fileHref(mainFile.id), external: false, kind: "file" };
  else if (resource) access = { href: resource, external: true, kind: "link" };
  else if (page?.bodyText.trim()) access = { href: "#conteudo", external: false, kind: "content" };

  return {
    code: d.order.code,
    productName: product.name,
    support: supportLink(product.supportWhatsApp, product.supportMessage),
    title: page?.title || "O seu produto está pronto",
    welcome: page?.welcome ?? "",
    instructions: page?.instructions ?? "",
    bodyText: page?.bodyText ?? "",
    buttonText: page?.buttonText || "ACEDER AO MEU PRODUTO",
    access,
    resourceUrl: resource && access?.kind !== "link" ? resource : null,
    files: product.files.map((f) => ({ id: f.id, filename: f.filename, sizeBytes: f.sizeBytes, href: fileHref(f.id), main: f.id === mainFile?.id })),
  };
}
export type DeliveryPageView = NonNullable<Awaited<ReturnType<typeof getDeliveryPageView>>>;

// ───────────── Área de acesso do comprador ─────────────

/**
 * Área "Os meus produtos" de uma compra, a partir do acesso pessoal (token secreto) de qualquer encomenda da
 * compra (principal, upsell ou downsell). Só existe com a compra principal paga; cada produto pago tem o seu
 * botão de acesso. Ficheiros nunca têm URL público: o download valida sempre o token e o pagamento.
 */
export async function getAccessArea(deliveryToken: string) {
  if (!TOKEN_RE.test(deliveryToken)) return null;
  const d = await prisma.delivery.findUnique({ where: { token: deliveryToken }, select: { id: true, orderId: true, order: { select: { status: true, isDemo: true } } } });
  // o próprio pedido do token tem de estar pago (reembolsos revogam o acesso)
  if (!d || d.order.status !== "APPROVED" || d.order.isDemo) return null;
  const purchase = await purchasedProducts(d.orderId);
  if (!purchase) return null;
  await prisma.delivery.update({ where: { id: d.id }, data: { accessCount: { increment: 1 }, lastAccessAt: new Date() } });
  // Ficheiros de configurações anteriores (PDF entregue pela página de obrigado antiga) que não são o ficheiro
  // principal de um produto já listado: continuam disponíveis, sempre pelo download autenticado
  const shownFiles = new Set(purchase.products.map((p) => (p.action?.kind === "file" ? p.action.href.split("/").pop() : null)).filter(Boolean));
  const rootToken = purchase.rootToken;
  const legacyFiles = rootToken
    ? (
        await prisma.productFile.findMany({
          where: { product: { orderItems: { some: { orderId: purchase.rootOrderId } }, deliveryMethod: { not: "FILE" } }, thankYouPages: { some: {} } },
          select: { id: true, filename: true, product: { select: { name: true } } },
        })
      )
        .filter((f) => !shownFiles.has(f.id))
        .map((f) => ({ id: f.id, filename: f.filename, productName: f.product.name, href: `/acesso/${rootToken}/ficheiro/${f.id}` }))
    : [];
  return { code: purchase.code, ownerId: purchase.ownerId, products: purchase.products, legacyFiles, rootToken };
}

/**
 * Recuperar o acesso sem email: o comprador indica o email usado na compra e o código da encomenda (ou o número
 * de telemóvel usado no pagamento). Só compras confirmadas; mensagens iguais quando nada é encontrado.
 */
export async function recoverAccess(input: { email: string; code?: string; phone?: string }) {
  const email = input.email.trim().toLowerCase();
  const code = input.code?.trim().toUpperCase() ?? "";
  const phoneDigits = (input.phone ?? "").replace(/\D/g, "").slice(-9);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return [];
  if (!code && phoneDigits.length < 9) return [];
  if (code && !/^NTP-[A-Z0-9]{4,16}$/.test(code)) return [];
  const orders = await prisma.order.findMany({
    where: {
      status: "APPROVED",
      isDemo: false,
      parentOrderId: null,
      customer: { email: { equals: email, mode: "insensitive" } },
      ...(code ? { code } : {}),
    },
    select: { code: true, createdAt: true, ownerId: true, delivery: { select: { token: true } }, customer: { select: { phone: true } }, items: { select: { product: { select: { name: true } } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return orders
    .filter((o) => o.delivery && (code || (o.customer.phone ?? "").replace(/\D/g, "").endsWith(phoneDigits)))
    .slice(0, 20)
    .map((o) => ({ code: o.code, createdAt: o.createdAt, ownerId: o.ownerId, products: [...new Set(o.items.map((i) => i.product.name))], href: `/acesso/${o.delivery!.token}` }));
}
