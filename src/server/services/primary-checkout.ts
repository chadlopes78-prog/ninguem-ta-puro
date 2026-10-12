// Checkout principal de cada produto: criado automaticamente com o produto, único por produto
// (coluna primaryProductId única) e com um endereço legível estável (slug).
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { newCheckoutPublicId, randomId } from "@/lib/ids";

type Tx = Prisma.TransactionClient;

/** "Handwriting Heroes!" → "handwriting-heroes" (sem acentos, só [a-z0-9-]). */
export function slugify(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s.length >= 2 ? s : `produto-${randomId(6, "23456789abcdefghjkmnpqrstuvwxyz")}`;
}

/** Slugs que colidem com rotas existentes ou são ambíguos. */
const RESERVED = new Set(["novo", "sucesso", "preview", "editor", "admin", "api"]);

async function availableSlug(tx: Tx, base: string): Promise<string> {
  const candidates = [base, ...Array.from({ length: 4 }, (_, i) => `${base}-${i + 2}`)];
  for (const c of candidates) {
    if (RESERVED.has(c)) continue;
    const taken = await tx.checkout.findUnique({ where: { slug: c }, select: { id: true } });
    if (!taken) return c;
  }
  return `${base}-${randomId(5, "23456789abcdefghjkmnpqrstuvwxyz")}`;
}

/** Cria o checkout principal dentro da mesma transação que cria o produto. */
export async function createPrimaryCheckoutTx(
  tx: Tx,
  product: { id: string; name: string; description: string; supportEmail: string | null; isDemo: boolean },
  offerId: string,
) {
  return tx.checkout.create({
    data: {
      publicId: newCheckoutPublicId(),
      slug: await availableSlug(tx, slugify(product.name)),
      primaryProductId: product.id,
      name: `Checkout — ${product.name}`.slice(0, 120),
      productId: product.id,
      offerId,
      title: product.name,
      description: product.description,
      supportEmail: product.supportEmail,
      isActive: true,
      isDemo: product.isDemo,
    },
  });
}

/**
 * Garante que o produto tem o seu checkout principal com endereço legível. Idempotente e seguro para repetir:
 * - recupera produtos criados antes desta funcionalidade ou cujo checkout falhou por algum motivo;
 * - produtos com checkouts antigos: o mais antigo passa a principal (o link antigo continua válido);
 * - nunca cria um segundo checkout principal (restrição única na base de dados).
 */
export async function ensurePrimaryCheckout(productId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await tx.checkout.findUnique({ where: { primaryProductId: productId } });
        const product = await tx.product.findUniqueOrThrow({
          where: { id: productId },
          include: { offers: { where: { isDefault: true }, take: 1 }, checkouts: { orderBy: { createdAt: "asc" }, take: 1 } },
        });
        if (existing) {
          if (existing.slug) return existing;
          return tx.checkout.update({ where: { id: existing.id }, data: { slug: await availableSlug(tx, slugify(product.name)) } });
        }
        const oldest = product.checkouts[0];
        if (oldest) {
          return tx.checkout.update({
            where: { id: oldest.id },
            data: { primaryProductId: productId, slug: oldest.slug ?? (await availableSlug(tx, slugify(product.name))) },
          });
        }
        const offer = product.offers[0];
        if (!offer) throw new Error("Produto sem preço principal");
        return createPrimaryCheckoutTx(tx, product, offer.id);
      });
    } catch (e) {
      // corrida com outro pedido (slug ou checkout principal criados em paralelo): volta a ler
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  return prisma.checkout.findUniqueOrThrow({ where: { primaryProductId: productId } });
}

/** Recuperação em lote (ex.: após migração): garante checkout principal para todos os produtos. */
export async function backfillPrimaryCheckouts(): Promise<number> {
  const missing = await prisma.product.findMany({
    where: { OR: [{ checkouts: { none: { primaryProductId: { not: null } } } }, { checkouts: { some: { primaryProductId: { not: null }, slug: null } } }] },
    select: { id: true },
  });
  for (const p of missing) await ensurePrimaryCheckout(p.id);
  return missing.length;
}

export function checkoutPath(c: { slug: string | null; publicId: string }): string {
  return `/checkout/${c.slug ?? c.publicId}`;
}
