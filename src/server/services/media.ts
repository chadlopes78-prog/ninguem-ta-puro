// Biblioteca de imagens de cada conta (editor visual do checkout).
// - Formatos aceites pelo CONTEÚDO (assinatura do ficheiro), não pela extensão: JPEG, PNG, WebP e GIF.
//   SVG é recusado (pode conter scripts).
// - Cada imagem pertence a uma conta (ownerId). Só essa conta a lista, a usa no seu design ou a apaga.
// - As imagens são públicas por natureza (aparecem no checkout), servidas com cache longa e nosniff.
import "server-only";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { DomainError, NotFoundError } from "./products";

/** Abaixo do limite de corpo dos pedidos na Vercel (~4,5 MB). O editor reduz imagens grandes antes de enviar. */
export const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
export const MAX_IMAGE_SIDE = 8000;
export const MAX_ASSETS_PER_ACCOUNT = 300;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export function mediaUrl(id: string) {
  return `/api/public/media/${id}`;
}

/** Tipo real da imagem pela assinatura binária (null = não é uma imagem aceite). */
export function sniffImage(b: Buffer): ImageMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length >= 6 && /^GIF8[79]a$/.test(b.subarray(0, 6).toString("latin1"))) return "image/gif";
  if (b.length >= 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** Dimensões (quando o cabeçalho as indica); usadas para recusar imagens desmesuradas e mostrar na biblioteca. */
export function imageSize(b: Buffer, mime: ImageMime): { width: number; height: number } | null {
  try {
    if (mime === "image/png") return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mime === "image/gif") return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    if (mime === "image/webp") {
      const chunk = b.subarray(12, 16).toString("latin1");
      if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
      if (chunk === "VP8L") {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      return null;
    }
    // JPEG: procura o marcador SOFn
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      const len = b.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
      i += 2 + len;
    }
  } catch {
    return null;
  }
  return null;
}

const SELECT = { id: true, filename: true, mimeType: true, sizeBytes: true, width: true, height: true, createdAt: true } as const;

export async function saveMedia(ownerId: string, file: { name: string; bytes: Buffer }) {
  const b = file.bytes;
  if (b.length === 0) throw new DomainError("O ficheiro está vazio.");
  if (b.length > MAX_IMAGE_BYTES) throw new DomainError("A imagem tem mais de 3 MB. Reduza o tamanho e tente novamente.");
  const mime = sniffImage(b);
  if (!mime) throw new DomainError("Formato não suportado. Use JPEG, PNG, WebP ou GIF.");
  const size = imageSize(b, mime);
  if (size && (size.width > MAX_IMAGE_SIDE || size.height > MAX_IMAGE_SIDE || size.width < 1 || size.height < 1)) throw new DomainError(`A imagem é demasiado grande (máximo ${MAX_IMAGE_SIDE} px de lado).`);
  const sha256 = createHash("sha256").update(b).digest("hex");
  // a mesma imagem carregada duas vezes pela mesma conta reutiliza o registo existente
  const existing = await prisma.mediaAsset.findUnique({ where: { ownerId_sha256: { ownerId, sha256 } }, select: SELECT });
  if (existing) return { ...existing, url: mediaUrl(existing.id) };
  if ((await prisma.mediaAsset.count({ where: { ownerId } })) >= MAX_ASSETS_PER_ACCOUNT) throw new DomainError(`Limite de ${MAX_ASSETS_PER_ACCOUNT} imagens atingido. Apague imagens que já não usa.`);
  const ext = mime.split("/")[1].replace("jpeg", "jpg");
  const filename = (file.name || `imagem.${ext}`).replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(0, 120);
  try {
    const created = await prisma.mediaAsset.create({
      data: { ownerId, filename, mimeType: mime, sizeBytes: b.length, width: size?.width ?? null, height: size?.height ?? null, sha256, data: new Uint8Array(b) },
      select: SELECT,
    });
    return { ...created, url: mediaUrl(created.id) };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await prisma.mediaAsset.findUniqueOrThrow({ where: { ownerId_sha256: { ownerId, sha256 } }, select: SELECT });
      return { ...again, url: mediaUrl(again.id) };
    }
    throw e;
  }
}

export async function listMedia(ownerId: string) {
  const rows = await prisma.mediaAsset.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" }, select: SELECT, take: MAX_ASSETS_PER_ACCOUNT });
  return rows.map((r) => ({ ...r, url: mediaUrl(r.id) }));
}

/** Apaga uma imagem da própria conta. Recusa se estiver a ser usada num checkout (rascunho ou publicado). */
export async function deleteMedia(ownerId: string, id: string) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id, ownerId }, select: { id: true } });
  if (!asset) throw new NotFoundError("Imagem");
  const path = mediaUrl(id);
  const designs = await prisma.checkoutDesign.findMany({ where: { checkout: { ownerId } }, select: { draft: true, published: true, checkout: { select: { product: { select: { name: true } } } } } });
  const using = designs.find((d) => JSON.stringify(d.draft).includes(path) || JSON.stringify(d.published ?? null).includes(path));
  if (using) throw new DomainError(`Esta imagem está a ser usada no checkout de “${using.checkout.product?.name ?? "um produto"}”. Remova-a do design antes de a apagar.`);
  await prisma.mediaAsset.delete({ where: { id } });
}

/** Confirma que todas as imagens da biblioteca usadas num design pertencem à conta (IDs alterados no browser são recusados). */
export async function assertOwnMedia(ownerId: string, ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  return (await prisma.mediaAsset.count({ where: { ownerId, id: { in: ids } } })) === ids.length;
}

/** Leitura pública (para mostrar no checkout). */
export async function getPublicMedia(id: string) {
  if (!/^[a-z0-9]{20,40}$/.test(id)) return null;
  return prisma.mediaAsset.findUnique({ where: { id }, select: { data: true, mimeType: true, sizeBytes: true, sha256: true } });
}
