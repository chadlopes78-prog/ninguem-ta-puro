// Ficheiros privados de produtos (PDF). Guardados na base de dados — nunca num URL público permanente.
// Download apenas através do acesso pessoal (token secreto) de uma encomenda PAGA que inclua o produto.
import "server-only";
import { createHash } from "crypto";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "./products";
import { own, type Scope } from "@/server/scope";

/** O alojamento (Vercel) limita o corpo dos pedidos a ~4,5 MB; fica-se abaixo disso. */
export const MAX_PDF_BYTES = 4 * 1024 * 1024;

export async function saveProductPdf(productId: string, scope: Scope, file: { name: string; type: string; bytes: Buffer }) {
  const product = await prisma.product.findFirst({ where: { id: productId, ...own(scope) }, select: { id: true } });
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

export async function deleteProductFile(fileId: string, scope: Scope) {
  const f = await prisma.productFile.findFirst({
    where: { id: fileId, product: own(scope) },
    include: { thankYouPages: { select: { id: true } }, deliveredBy: { select: { status: true, deliveryMethod: true } } },
  });
  if (!f) throw new NotFoundError("Ficheiro");
  if (f.thankYouPages.length) throw new DomainError("Este PDF está a ser entregue numa página de obrigado. Escolha outro destino antes de o eliminar.");
  // os compradores de um produto publicado ficariam sem o produto: substitua-o em vez de o remover
  if (f.deliveredBy.some((p) => p.status === "PUBLISHED" && p.deliveryMethod === "FILE")) {
    throw new DomainError("Este ficheiro é o produto entregue aos compradores de um produto publicado. Carregue outro ficheiro para o substituir.");
  }
  await prisma.productFile.delete({ where: { id: fileId } });
}

/**
 * Define o ficheiro entregue do produto (método "Ficheiro"). Ao substituir, o ficheiro anterior é eliminado se não
 * for usado noutro sítio (página de entrega ou página de obrigado) — assim deixa de poder ser descarregado.
 * Compras já feitas passam a receber o ficheiro novo pelo mesmo acesso pessoal.
 */
export async function setProductDeliveryFile(productId: string, fileId: string, scope: Scope) {
  const product = await prisma.product.findFirst({ where: { id: productId, ...own(scope) }, select: { id: true, deliveryFileId: true } });
  if (!product) throw new NotFoundError("Produto");
  const file = await prisma.productFile.findFirst({ where: { id: fileId, productId: product.id }, select: { id: true } });
  if (!file) throw new DomainError("O ficheiro não pertence a este produto.");
  const previous = product.deliveryFileId && product.deliveryFileId !== fileId ? product.deliveryFileId : null;
  await prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id: product.id }, data: { deliveryFileId: fileId } });
    if (previous) {
      const used = await tx.productFile.findUnique({ where: { id: previous }, select: { _count: { select: { thankYouPages: true, deliveryPages: true, deliveredBy: true } } } });
      if (used && used._count.thankYouPages === 0 && used._count.deliveryPages === 0 && used._count.deliveredBy === 0) await tx.productFile.delete({ where: { id: previous } });
    }
  });
}

/** Remove o ficheiro entregue do produto (o produto fica sem entregável até carregar outro). */
export async function removeProductDeliveryFile(productId: string, scope: Scope) {
  const product = await prisma.product.findFirst({ where: { id: productId, ...own(scope) }, select: { id: true, deliveryFileId: true } });
  if (!product) throw new NotFoundError("Produto");
  if (!product.deliveryFileId) return;
  await deleteProductFile(product.deliveryFileId, scope);
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
