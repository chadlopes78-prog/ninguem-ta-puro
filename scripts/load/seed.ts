// Dados para os testes de carga (APENAS na base de dados de testes ntp_test): conta proprietária, produto
// publicado com foto real (~1600 px) e o checkout principal. Escreve o resultado em JSON (argv[2]).
// Uso: set -a; . ./.env.test; set +a; npx tsx --conditions=react-server scripts/load/seed.ts <saida.json> <foto.jpg>
import { readFileSync, writeFileSync } from "fs";
import { prisma } from "../../src/server/db";
import { createUser } from "../../src/server/auth/service";
import { scopeOf } from "../../src/server/scope";
import { productSchema } from "../../src/server/validation/schemas";
import { saveMedia } from "../../src/server/services/media";
import { createProduct } from "../../tests/helpers/products";

async function main() {
  if (!process.env.DATABASE_URL?.includes("/ntp_test")) throw new Error("apenas ntp_test");
  const [out, photo] = process.argv.slice(2);
  const email = "carga@ntp.local";
  const owner = (await prisma.user.findUnique({ where: { email } })) ?? (await createUser({ email, name: "Conta de carga", password: "carga-password-123" }, { role: "USER", status: "APPROVED" }));
  const S = scopeOf(owner.id, false);
  const media = await saveMedia(owner.id, { name: "produto.jpg", bytes: readFileSync(photo) });
  const products = [];
  for (const n of [1, 2]) {
    const p = await createProduct(
      productSchema.parse({ name: `Curso de carga ${n} ${Date.now()}`, description: "Produto para testes de carga.", type: "COURSE", priceCents: n === 1 ? "500,00" : "750,00", currency: "MZN", status: "PUBLISHED", imageUrl: media.url }),
      S,
    );
    products.push({ id: p.id, slug: p.primaryCheckout.slug, publicId: p.primaryCheckout.publicId, priceCents: p.offers[0].priceCents });
  }
  writeFileSync(out, JSON.stringify({ ownerId: owner.id, imageUrl: media.url, products }, null, 2));
  console.log(JSON.stringify(products));
}
main().finally(() => prisma.$disconnect());
