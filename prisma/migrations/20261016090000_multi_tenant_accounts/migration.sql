-- Multiutilizador: contas com papel/estado, isolamento por conta (ownerId) e integrações por conta.
-- Migração não destrutiva: nenhum registo comercial é apagado; todos os dados existentes ficam associados
-- à conta proprietária. As credenciais existentes (IntegrationConfig) são mantidas e passam a ser do proprietário.

-- 1. Papéis e estados das contas
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'USER');
CREATE TYPE "AccountStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');

ALTER TABLE "User" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "banReason" TEXT,
ADD COLUMN "bannedAt" TIMESTAMP(3),
ADD COLUMN "lastLoginAt" TIMESTAMP(3),
ADD COLUMN "rejectedAt" TIMESTAMP(3),
ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER',
ADD COLUMN "status" "AccountStatus" NOT NULL DEFAULT 'PENDING_APPROVAL';

-- Contas que já existiam antes desta versão administravam a loja: continuam com acesso (aprovadas).
UPDATE "User" SET "status" = 'APPROVED', "approvedAt" = "createdAt";

-- 2. Conta proprietária: chadlopesff@gmail.com; se não existir, a primeira conta criada (a conta de proprietário
--    criada em /setup). Nunca é escolhida a partir de dados enviados pelo browser.
UPDATE "User" SET "role" = 'OWNER'
WHERE "id" = (SELECT "id" FROM "User" ORDER BY (lower("email") = 'chadlopesff@gmail.com') DESC, "createdAt" ASC LIMIT 1);

-- No máximo uma conta OWNER (garantia da base de dados, além das verificações no servidor)
CREATE UNIQUE INDEX "User_single_owner_key" ON "User"("role") WHERE "role" = 'OWNER';

-- 3. Histórico de ações administrativas
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- 4. Dono de cada registo: coluna criada sem obrigatoriedade, preenchida com a conta proprietária e só depois obrigatória
ALTER TABLE "AnalyticsEvent" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Checkout" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "CheckoutSession" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Coupon" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Customer" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Funnel" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "FunnelRun" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "IntegrationConfig" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Order" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Product" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Refund" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "IntegrationLog" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "PaymentEvent" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Settings" ADD COLUMN "ownerId" TEXT;
ALTER TABLE "Settings" ALTER COLUMN "id" DROP DEFAULT;

UPDATE "AnalyticsEvent" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "Checkout" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "CheckoutSession" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "Coupon" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "Customer" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "Funnel" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "FunnelRun" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "IntegrationConfig" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "Order" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "Product" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "Refund" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "IntegrationLog" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
UPDATE "PaymentEvent" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "ownerId" IS NULL;
-- As configurações globais anteriores passam a ser as configurações da conta proprietária
UPDATE "Settings" SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'OWNER') WHERE "id" = 'default' AND "ownerId" IS NULL;

-- Segurança: não continuar se existirem dados sem conta proprietária (base de dados sem utilizadores)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Product" WHERE "ownerId" IS NULL)
     OR EXISTS (SELECT 1 FROM "Order" WHERE "ownerId" IS NULL)
     OR EXISTS (SELECT 1 FROM "IntegrationConfig" WHERE "ownerId" IS NULL)
     OR EXISTS (SELECT 1 FROM "Customer" WHERE "ownerId" IS NULL) THEN
    RAISE EXCEPTION 'Existem registos sem conta proprietária: crie primeiro a conta do proprietário e repita a migração.';
  END IF;
END $$;

ALTER TABLE "AnalyticsEvent" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Checkout" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "CheckoutSession" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Coupon" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Customer" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Funnel" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "FunnelRun" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "IntegrationConfig" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Order" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Product" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Refund" ALTER COLUMN "ownerId" SET NOT NULL;

-- 5. Unicidade por conta (antes era global)
DROP INDEX "Coupon_code_isDemo_key";
DROP INDEX "Customer_email_isDemo_key";
DROP INDEX "IntegrationConfig_provider_key";

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetUserId_createdAt_idx" ON "AdminAuditLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_ownerId_isDemo_type_createdAt_idx" ON "AnalyticsEvent"("ownerId", "isDemo", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Checkout_ownerId_isDemo_idx" ON "Checkout"("ownerId", "isDemo");

-- CreateIndex
CREATE INDEX "CheckoutSession_ownerId_isDemo_createdAt_idx" ON "CheckoutSession"("ownerId", "isDemo", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_ownerId_code_isDemo_key" ON "Coupon"("ownerId", "code", "isDemo");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_ownerId_email_isDemo_key" ON "Customer"("ownerId", "email", "isDemo");

-- CreateIndex
CREATE INDEX "Funnel_ownerId_isDemo_idx" ON "Funnel"("ownerId", "isDemo");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_ownerId_provider_key" ON "IntegrationConfig"("ownerId", "provider");

-- CreateIndex
CREATE INDEX "IntegrationLog_ownerId_createdAt_idx" ON "IntegrationLog"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_ownerId_isDemo_status_createdAt_idx" ON "Order"("ownerId", "isDemo", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Product_ownerId_isDemo_status_idx" ON "Product"("ownerId", "isDemo", "status");

-- CreateIndex
CREATE INDEX "Refund_ownerId_isDemo_createdAt_idx" ON "Refund"("ownerId", "isDemo", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_ownerId_key" ON "Settings"("ownerId");


-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminAuditLog" ADD CONSTRAINT "AdminAuditLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutSession" ADD CONSTRAINT "CheckoutSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Funnel" ADD CONSTRAINT "Funnel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FunnelRun" ADD CONSTRAINT "FunnelRun_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsEvent" ADD CONSTRAINT "AnalyticsEvent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settings" ADD CONSTRAINT "Settings_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConfig" ADD CONSTRAINT "IntegrationConfig_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

