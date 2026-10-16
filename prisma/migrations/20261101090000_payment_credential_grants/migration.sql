-- Partilha das credenciais de pagamento do administrador com utilizadores autorizados (aditiva).
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_ALERT';

CREATE TYPE "CredentialGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- Conta cujas credenciais foram usadas no pagamento (null = conta dona da encomenda, como até agora)
ALTER TABLE "Payment" ADD COLUMN "credentialOwnerId" TEXT;

CREATE TABLE "PaymentCredentialGrant" (
    "id" TEXT NOT NULL,
    "grantorId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "CredentialGrantStatus" NOT NULL DEFAULT 'ACTIVE',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "removalRequestedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCredentialGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentCredentialGrant_granteeId_provider_status_idx" ON "PaymentCredentialGrant"("granteeId", "provider", "status");
CREATE INDEX "PaymentCredentialGrant_grantorId_status_idx" ON "PaymentCredentialGrant"("grantorId", "status");
-- no máximo uma autorização ativa por utilizador e gateway
CREATE UNIQUE INDEX "PaymentCredentialGrant_one_active_key" ON "PaymentCredentialGrant"("granteeId", "provider") WHERE "status" = 'ACTIVE';

ALTER TABLE "PaymentCredentialGrant" ADD CONSTRAINT "PaymentCredentialGrant_grantorId_fkey" FOREIGN KEY ("grantorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentCredentialGrant" ADD CONSTRAINT "PaymentCredentialGrant_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
