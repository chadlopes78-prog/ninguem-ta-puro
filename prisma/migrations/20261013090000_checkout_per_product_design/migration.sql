-- AlterTable
ALTER TABLE "Checkout" ADD COLUMN     "primaryProductId" TEXT,
ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "CheckoutDesign" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "draftUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutDesign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutDesign_checkoutId_key" ON "CheckoutDesign"("checkoutId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_slug_key" ON "Checkout"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_primaryProductId_key" ON "Checkout"("primaryProductId");

-- AddForeignKey
ALTER TABLE "CheckoutDesign" ADD CONSTRAINT "CheckoutDesign_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Associação dos dados existentes (preserva todos os links já partilhados):
-- para cada produto, o checkout mais antigo passa a ser o checkout principal (mantém o publicId).
-- Os produtos sem checkout recebem um checkout principal na aplicação (ensurePrimaryCheckout), que gera um slug único.
UPDATE "Checkout" c SET "primaryProductId" = c."productId"
WHERE c."id" IN (
  SELECT DISTINCT ON ("productId") "id" FROM "Checkout" ORDER BY "productId", "createdAt" ASC
);
