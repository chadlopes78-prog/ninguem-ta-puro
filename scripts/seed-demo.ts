// Gera dados de demonstração isolados (isDemo = true) para UMA conta. Recusa correr sem DEMO_TOOLS_ENABLED=true.
// Uso: npm run db:seed-demo -- email@da-conta.com
import { prisma } from "../src/server/db";
import { seedDemoData } from "../src/server/services/demo";
import { getSettings, setDemoMode } from "../src/server/services/settings";

async function main() {
  if (process.env.DEMO_TOOLS_ENABLED !== "true") {
    console.error("DEMO_TOOLS_ENABLED não está ativo. Dados de demonstração não são criados neste ambiente.");
    process.exit(1);
  }
  const email = process.argv[2]?.toLowerCase().trim();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user) {
    console.error("Indique o email de uma conta existente: npm run db:seed-demo -- email@exemplo.com");
    process.exit(1);
  }
  const s = await getSettings(user.id);
  const r = await seedDemoData(user.id, new Date(), s.defaultCurrency);
  await setDemoMode(user.id, true);
  console.log(`Dados de demonstração criados para ${user.email} e modo de demonstração ativado:`, r);
}
main().finally(() => prisma.$disconnect());
