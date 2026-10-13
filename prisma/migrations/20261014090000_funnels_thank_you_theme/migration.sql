-- Funis por produto (assistente), páginas de obrigado, ficheiros privados de produto, upsells como pedidos próprios
-- e preferência de tema do painel. Migração aditiva: dados existentes são preservados.
-- FunnelRun.orderId passa a único (um percurso por encomenda; até aqui só era criado um por encomenda).
-- AlterTable
ALTER TABLE "Funnel" ADD COLUMN     "productId" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "funnelStepKey" TEXT,
ADD COLUMN     "parentOrderId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "themePreference" TEXT NOT NULL DEFAULT 'system';

-- CreateTable
CREATE TABLE "ThankYouPage" (
    "id" TEXT NOT NULL,
    "funnelId" TEXT NOT NULL,
    "design" JSONB NOT NULL DEFAULT '{}',
    "action" JSONB NOT NULL DEFAULT '{}',
    "fileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThankYouPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductFile" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ThankYouPage_funnelId_key" ON "ThankYouPage"("funnelId");

-- CreateIndex
CREATE INDEX "ProductFile_productId_idx" ON "ProductFile"("productId");

-- CreateIndex
CREATE INDEX "Funnel_productId_idx" ON "Funnel"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "FunnelRun_orderId_key" ON "FunnelRun"("orderId");

-- CreateIndex
CREATE INDEX "Order_parentOrderId_idx" ON "Order"("parentOrderId");

-- AddForeignKey
ALTER TABLE "Funnel" ADD CONSTRAINT "Funnel_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThankYouPage" ADD CONSTRAINT "ThankYouPage_funnelId_fkey" FOREIGN KEY ("funnelId") REFERENCES "Funnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThankYouPage" ADD CONSTRAINT "ThankYouPage_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "ProductFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductFile" ADD CONSTRAINT "ProductFile_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_parentOrderId_fkey" FOREIGN KEY ("parentOrderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

