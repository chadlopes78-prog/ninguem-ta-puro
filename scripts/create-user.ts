// Uso (administração no servidor):
//   npm run user:create -- email@exemplo.com "Nome" "password-com-10+-caracteres"
// Cria uma conta APROVADA com papel USER (não passa pela fila de aprovação). Nunca cria OWNER:
// a conta proprietária é definida pela migração ou por scripts/set-owner.ts.
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
  const u = await createUser(parsed.data, { role: "USER", status: "APPROVED" });
  console.log(`Utilizador criado (aprovado): ${u.email}`);
}
main().finally(() => prisma.$disconnect());
