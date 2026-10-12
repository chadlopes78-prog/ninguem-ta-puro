import "server-only";
import { prisma } from "@/server/db";

export type DbState = "ok" | "missing_url" | "unreachable" | "not_migrated";

export interface SystemHealth {
  ok: boolean;
  database: DbState;
  env: { DATABASE_URL: boolean; APP_BASE_URL: boolean; EPAY_SECRET_KEY: boolean };
}

/** Estado da instalação, sem nunca revelar valores de variáveis ou detalhes internos. */
export async function getSystemHealth(): Promise<SystemHealth> {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    APP_BASE_URL: Boolean(process.env.APP_BASE_URL ?? process.env.APP_URL),
    EPAY_SECRET_KEY: Boolean(process.env.EPAY_SECRET_KEY),
  };
  let database: DbState = "ok";
  if (!env.DATABASE_URL) database = "missing_url";
  else {
    try {
      const rows = await prisma.$queryRaw<{ exists: boolean }[]>`SELECT to_regclass('public."User"') IS NOT NULL AS "exists"`;
      if (!rows[0]?.exists) database = "not_migrated";
    } catch {
      database = "unreachable";
    }
  }
  return { ok: database === "ok", database, env };
}
