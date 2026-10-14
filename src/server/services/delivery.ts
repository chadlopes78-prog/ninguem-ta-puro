// Entrega do produto comprado (link externo ou página de entrega interna).
// Regras: só com encomenda PAGA (confirmada pelo processador), nunca de demonstração; o produto tem de
// fazer parte DESSA encomenda (IDs alterados no URL não dão acesso a outros produtos ou contas).
import "server-only";
import { prisma } from "@/server/db";
import { isValidDeliveryUrl, supportLink } from "@/lib/product-setup";

const TOKEN_RE = /^[A-Za-z0-9_-]{30,40}$/;
const ID_RE = /^[a-z0-9]{10,40}$/i;

export function deliveryPagePath(deliveryToken: string, productId: string) {
  return `/entrega/${deliveryToken}/${productId}`;
}

/** Botão de acesso de um produto comprado, conforme o método de entrega escolhido pelo vendedor. */
export function accessTarget(p: { id: string; deliveryMethod: "EXTERNAL_LINK" | "INTERNAL_PAGE" | null; deliveryUrl: string | null }, deliveryToken: string | null) {
  if (p.deliveryMethod === "EXTERNAL_LINK" && p.deliveryUrl && isValidDeliveryUrl(p.deliveryUrl)) return { href: p.deliveryUrl, external: true, kind: "external" as const };
  if (p.deliveryMethod === "INTERNAL_PAGE" && deliveryToken) return { href: deliveryPagePath(deliveryToken, p.id), external: false, kind: "internal" as const };
  return null;
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
  if (product.deliveryMethod === "EXTERNAL_LINK" && product.deliveryUrl && isValidDeliveryUrl(product.deliveryUrl)) access = { href: product.deliveryUrl, external: true, kind: "external" };
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
