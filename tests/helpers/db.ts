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

/** Conta proprietária de teste (aprovada). As credenciais das variáveis de ambiente só valem para esta conta. */
export async function testOwner(email = "proprietario@ntp.local") {
  const { createUser } = await import("@/server/auth/service");
  return createUser({ email, name: "Dono de teste", password: "password-123456" }, { role: "OWNER", status: "APPROVED" });
}

/** Conta comum aprovada (outro vendedor). */
export async function testSeller(email: string, name = "Vendedor") {
  const { createUser } = await import("@/server/auth/service");
  return createUser({ email, name, password: "password-123456" }, { role: "USER", status: "APPROVED" });
}
