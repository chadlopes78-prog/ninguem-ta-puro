// Administração no servidor (recuperação): define a conta proprietária (OWNER) da plataforma.
// Uso: npx tsx --env-file=.env scripts/set-owner.ts email@exemplo.com
// - só corre com acesso direto ao servidor/base de dados (nunca há rota HTTP para isto);
// - a conta tem de existir; fica APROVADA e sem suspensão; a anterior volta a USER (existe no máximo um OWNER);
// - não move dados comerciais entre contas.
import { prisma } from "../src/server/db";

async function main() {
  const email = process.argv[2]?.toLowerCase().trim();
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;
  if (!user) {
    console.error("Indique o email de uma conta existente.");
    process.exit(1);
  }
  await prisma.$transaction([
    prisma.user.updateMany({ where: { role: "OWNER", id: { not: user.id } }, data: { role: "USER" } }),
    prisma.user.update({ where: { id: user.id }, data: { role: "OWNER", status: "APPROVED", bannedAt: null, banReason: null, approvedAt: user.approvedAt ?? new Date() } }),
  ]);
  console.log(`${user.email} é agora a conta proprietária (OWNER).`);
}
main().finally(() => prisma.$disconnect());
