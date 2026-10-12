import { prisma } from "@/server/db";

/** Limpa todas as tabelas — apenas permitido na base de dados de teste. */
export async function resetTestDb() {
  if (!process.env.DATABASE_URL?.includes("/ntp_test")) throw new Error("resetTestDb só pode correr em ntp_test");
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} CASCADE`);
  }
}
