// Uso: npm run db:clear-demo -- email@da-conta.com — remove os dados de demonstração DESSA conta e desativa o modo.
import { prisma } from "../src/server/db";
import { clearDemoData } from "../src/server/services/demo";
import { setDemoMode } from "../src/server/services/settings";

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user) {
    console.error("Indique o email de uma conta existente: npm run db:clear-demo -- email@exemplo.com");
    process.exit(1);
  }
  await clearDemoData(user.id);
  await setDemoMode(user.id, false);
  console.log(`Dados de demonstração de ${user.email} removidos e modo de demonstração desativado.`);
}
main().finally(() => prisma.$disconnect());
