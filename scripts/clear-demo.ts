import { prisma } from "../src/server/db";
import { clearDemoData } from "../src/server/services/demo";
import { setDemoMode } from "../src/server/services/settings";

async function main() {
  await clearDemoData();
  await setDemoMode(false);
  console.log("Dados de demonstração removidos e modo de demonstração desativado.");
}
main().finally(() => prisma.$disconnect());
