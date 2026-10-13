-- Gateways de pagamento independentes (EPay + E2Payments). Migração aditiva: não altera dados existentes.
-- Registos existentes (ex.: EPay) ficam com enabled = true, mantendo o comportamento atual.
-- Reverter: ALTER TABLE "IntegrationConfig" DROP COLUMN "enabled", DROP COLUMN "secretConfig", DROP COLUMN "verifiedAt";
-- AlterTable
ALTER TABLE "IntegrationConfig" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "secretConfig" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

