import { execSync } from "child_process";
import { readFileSync } from "fs";

export default async function globalSetup() {
  const env = Object.fromEntries(
    readFileSync(".env.test", "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")]),
  );
  if (!env.DATABASE_URL?.includes("/ntp_test")) throw new Error("E2E apenas na base de dados ntp_test");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, ...env } });
  execSync("npx tsx e2e/reset-db.ts", { stdio: "inherit", env: { ...process.env, ...env } });
}
