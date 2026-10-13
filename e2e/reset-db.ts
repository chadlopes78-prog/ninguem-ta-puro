// Limpa a base de dados de teste e cria o utilizador E2E.
import { prisma } from "../src/server/db";
import { createUser } from "../src/server/auth/service";

async function main() {
  if (!process.env.DATABASE_URL?.includes("/ntp_test")) throw new Error("apenas ntp_test");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} CASCADE`);
  // Utilizador E2E = proprietário da plataforma (aprovado), como a conta real do dono após a migração
  await createUser({ email: "e2e@ntp.local", name: "Dono E2E", password: "e2e-password-123" }, { role: "OWNER", status: "APPROVED" });
}
main().finally(() => prisma.$disconnect());
