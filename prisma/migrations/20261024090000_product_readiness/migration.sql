-- Requisitos de publicação: suporte WhatsApp, método de entrega, página de entrega interna, funil principal
-- e redefinição de palavra-passe. Migração ADITIVA: nada é apagado; vendas, funis e configurações mantêm-se.

-- CreateEnum
CREATE TYPE "DeliveryMethod" AS ENUM ('EXTERNAL_LINK', 'INTERNAL_PAGE');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "deliveryMethod" "DeliveryMethod",
ADD COLUMN     "mainFunnelId" TEXT,
ADD COLUMN     "supportMessage" TEXT,
ADD COLUMN     "supportWhatsApp" TEXT;

-- CreateTable
CREATE TABLE "DeliveryPage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'O seu produto está pronto',
    "welcome" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "bodyText" TEXT NOT NULL DEFAULT '',
    "buttonText" TEXT NOT NULL DEFAULT 'ACEDER AO MEU PRODUTO',
    "resourceUrl" TEXT,
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPage_productId_key" ON "DeliveryPage"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_createdAt_idx" ON "PasswordResetToken"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_mainFunnelId_fkey" FOREIGN KEY ("mainFunnelId") REFERENCES "Funnel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPage" ADD CONSTRAINT "DeliveryPage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPage" ADD CONSTRAINT "DeliveryPage_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProductFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ───────────── Dados existentes → novos campos (não altera estados nem vendas) ─────────────

-- 1. Produtos que já tinham o "URL de entrega/acesso" preenchido passam a usar o método link externo
UPDATE "Product" SET "deliveryMethod" = 'EXTERNAL_LINK'
WHERE "deliveryMethod" IS NULL AND COALESCE(btrim("deliveryUrl"), '') <> '';

-- 2. Funil principal: o funil do assistente ligado ao checkout principal; senão o mais recente do produto (sempre da mesma conta)
UPDATE "Product" p SET "mainFunnelId" = c."funnelId"
FROM "Checkout" c JOIN "Funnel" f ON f."id" = c."funnelId"
WHERE c."primaryProductId" = p."id" AND f."productId" = p."id" AND f."ownerId" = p."ownerId" AND p."mainFunnelId" IS NULL;

UPDATE "Product" p SET "mainFunnelId" = (
  SELECT f."id" FROM "Funnel" f WHERE f."productId" = p."id" AND f."ownerId" = p."ownerId" ORDER BY f."updatedAt" DESC LIMIT 1
)
WHERE p."mainFunnelId" IS NULL AND EXISTS (SELECT 1 FROM "Funnel" f WHERE f."productId" = p."id" AND f."ownerId" = p."ownerId");

-- 3. A configuração anterior da página de obrigado do funil principal é aproveitada
--    a) botão WhatsApp → número de suporte do produto
UPDATE "Product" p SET "supportWhatsApp" = regexp_replace(t."action"->>'phone', '[^0-9]', '', 'g'), "supportMessage" = NULLIF(t."action"->>'message', '')
FROM "ThankYouPage" t
WHERE t."funnelId" = p."mainFunnelId" AND t."action"->>'type' = 'whatsapp' AND COALESCE(t."action"->>'phone', '') <> '' AND p."supportWhatsApp" IS NULL;
-- números moçambicanos locais (8XXXXXXXX) recebem o indicativo 258, como no validador da aplicação
UPDATE "Product" SET "supportWhatsApp" = '258' || "supportWhatsApp" WHERE "supportWhatsApp" ~ '^8[2-7][0-9]{7}$';

--    b) botão "aceder ao produto" por link → link externo de entrega
UPDATE "Product" p SET "deliveryUrl" = t."action"->>'url', "deliveryMethod" = 'EXTERNAL_LINK'
FROM "ThankYouPage" t
WHERE t."funnelId" = p."mainFunnelId" AND t."action"->>'type' = 'product' AND t."action"->>'delivery' = 'link'
  AND COALESCE(t."action"->>'url', '') <> '' AND p."deliveryMethod" IS NULL;

--    c) botão "descarregar PDF" → página de entrega interna com esse ficheiro
INSERT INTO "DeliveryPage" ("id", "productId", "fileId", "updatedAt")
SELECT 'c' || substr(md5(random()::text || p."id"), 1, 24), p."id", t."fileId", CURRENT_TIMESTAMP
FROM "Product" p JOIN "ThankYouPage" t ON t."funnelId" = p."mainFunnelId"
WHERE t."action"->>'type' = 'product' AND t."action"->>'delivery' = 'pdf' AND t."fileId" IS NOT NULL
  AND p."deliveryMethod" IS NULL AND NOT EXISTS (SELECT 1 FROM "DeliveryPage" d WHERE d."productId" = p."id");

UPDATE "Product" p SET "deliveryMethod" = 'INTERNAL_PAGE'
FROM "DeliveryPage" d WHERE d."productId" = p."id" AND p."deliveryMethod" IS NULL;
