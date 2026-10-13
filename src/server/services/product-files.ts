// Ficheiros privados de produtos (PDF). Guardados na base de dados — nunca num URL público permanente.
// Download apenas através do acesso pessoal (token secreto) de uma encomenda PAGA que inclua o produto.
import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "./products";

/** O alojamento (Vercel) limita o corpo dos pedidos a ~4,5 MB; fica-se abaixo disso. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

export async function saveProductPdf(productId: string, isDemo: boolean, file: { name: string; type: string; bytes: Buffer }) {
  const product = await prisma.product.findFirst({ where: { id: productId, isDemo }, select: { id: true } });
  if (!product) throw new NotFoundError("Produto");
  if (file.bytes.length === 0) throw new DomainError("O ficheiro está vazio.");
  if (file.bytes.length > MAX_PDF_BYTES) throw new DomainError("O PDF tem mais de 4 MB. Reduza o tamanho e tente novamente.");
  // Valida o conteúdo, não apenas a extensão: um PDF começa sempre por "%PDF-"
  if (file.bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw new DomainError("O ficheiro não é um PDF válido.");
  const filename = (file.name || "produto.pdf").replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 120).replace(/(\.pdf)?$/i, ".pdf");
  const created = await prisma.productFile.create({
    data: { productId, filename, mimeType: "application/pdf", sizeBytes: file.bytes.length, sha256: createHash("sha256").update(file.bytes).digest("hex"), data: new Uint8Array(file.bytes) },
    select: { id: true, filename: true, sizeBytes: true, createdAt: true },
  });
  return created;
}

export async function deleteProductFile(fileId: string, isDemo: boolean) {
  const f = await prisma.productFile.findFirst({ where: { id: fileId, product: { isDemo } }, include: { thankYouPages: { select: { id: true } } } });
  if (!f) throw new NotFoundError("Ficheiro");
  if (f.thankYouPages.length) throw new DomainError("Este PDF está a ser entregue numa página de obrigado. Escolha outro destino antes de o eliminar.");
  await prisma.productFile.delete({ where: { id: fileId } });
}

/**
 * Ficheiro para um comprador autorizado: o token de acesso tem de pertencer a uma encomenda paga (não reembolsada)
 * que contenha o produto dono do ficheiro. Caso contrário devolve null (sem revelar se o ficheiro existe).
 */
export async function fileForBuyer(deliveryToken: string, fileId: string) {
  if (!/^[A-Za-z0-9_-]{30,40}$/.test(deliveryToken) || !/^[a-z0-9]{10,40}$/i.test(fileId)) return null;
  const delivery = await prisma.delivery.findUnique({ where: { token: deliveryToken }, include: { order: { include: { items: { select: { productId: true } } } } } });
  if (!delivery || delivery.order.status !== "APPROVED" || delivery.order.isDemo) return null;
  const file = await prisma.productFile.findUnique({ where: { id: fileId } });
  if (!file || !delivery.order.items.some((i) => i.productId === file.productId)) return null;
  await prisma.delivery.update({ where: { id: delivery.id }, data: { accessCount: { increment: 1 }, lastAccessAt: new Date() } });
  return file;
}

/** PDFs disponíveis para uma encomenda paga (para a página de acesso). */
export async function filesForDelivery(deliveryToken: string) {
  const delivery = await prisma.delivery.findUnique({ where: { token: deliveryToken }, include: { order: { include: { items: { select: { productId: true } } } } } });
  if (!delivery || delivery.order.status !== "APPROVED" || delivery.order.isDemo) return [];
  return prisma.productFile.findMany({
    where: { productId: { in: delivery.order.items.map((i) => i.productId) } },
    select: { id: true, filename: true, sizeBytes: true, product: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}
