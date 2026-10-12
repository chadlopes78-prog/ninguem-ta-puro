// Uso: npm run user:create -- email@exemplo.com "Nome" "password-com-10+-caracteres"
import { createUser } from "../src/server/auth/service";
import { prisma } from "../src/server/db";
import { setupSchema } from "../src/server/validation/schemas";

async function main() {
  const [email, name, password] = process.argv.slice(2);
  const parsed = setupSchema.safeParse({ email, name, password, confirm: password });
  if (!parsed.success) {
    console.error("Dados inválidos:", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
    process.exit(1);
  }
  const u = await createUser(parsed.data);
  console.log(`Utilizador criado: ${u.email}`);
}
main().finally(() => prisma.$disconnect());
