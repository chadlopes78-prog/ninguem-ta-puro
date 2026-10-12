import { execSync } from "child_process";

export default function setup() {
  if (!process.env.DATABASE_URL?.includes("/ntp_test")) {
    throw new Error("Os testes devem correr contra a base de dados de teste (ntp_test).");
  }
  // Aplica migrações pendentes (não destrutivo). A limpeza de dados é feita por tests/helpers/db.ts.
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: process.env });
}
