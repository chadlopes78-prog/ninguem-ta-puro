// Gera dados de demonstração isolados (isDemo = true). Recusa correr sem DEMO_TOOLS_ENABLED=true.
import { prisma } from "../src/server/db";
import { seedDemoData } from "../src/server/services/demo";
import { getSettings, setDemoMode } from "../src/server/services/settings";

async function main() {
  if (process.env.DEMO_TOOLS_ENABLED !== "true") {
    console.error("DEMO_TOOLS_ENABLED não está ativo. Dados de demonstração não são criados neste ambiente.");
    process.exit(1);
  }
  const s = await getSettings();
  const r = await seedDemoData(new Date(), s.defaultCurrency);
  await setDemoMode(true);
  console.log("Dados de demonstração criados e modo de demonstração ativado:", r);
}
main().finally(() => prisma.$disconnect());
