-- Facebook Pixel / API de Conversões (Meta): tabelas novas, migração só ADITIVA (nada é alterado nem apagado).
-- CreateEnum
CREATE TYPE "MetaEventStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "MetaPixel" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "pixelId" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "tokenHint" TEXT NOT NULL,
    "testEventCode" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaPixel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaPixelProduct" (
    "id" TEXT NOT NULL,
    "metaPixelId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaPixelProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaEvent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "metaPixelId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" "MetaEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "eventsReceived" INTEGER,
    "fbtraceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTrackingContext" (
    "orderId" TEXT NOT NULL,
    "userAgent" TEXT,
    "fbc" TEXT,
    "sourceUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTrackingContext_pkey" PRIMARY KEY ("orderId")
);

-- CreateIndex
CREATE INDEX "MetaPixel_ownerId_idx" ON "MetaPixel"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPixel_ownerId_pixelId_key" ON "MetaPixel"("ownerId", "pixelId");

-- CreateIndex
CREATE INDEX "MetaPixelProduct_productId_idx" ON "MetaPixelProduct"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaPixelProduct_metaPixelId_productId_key" ON "MetaPixelProduct"("metaPixelId", "productId");

-- CreateIndex
CREATE INDEX "MetaEvent_status_nextAttemptAt_idx" ON "MetaEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MetaEvent_ownerId_createdAt_idx" ON "MetaEvent"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetaEvent_metaPixelId_orderId_key" ON "MetaEvent"("metaPixelId", "orderId");

-- AddForeignKey
ALTER TABLE "MetaPixel" ADD CONSTRAINT "MetaPixel_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPixelProduct" ADD CONSTRAINT "MetaPixelProduct_metaPixelId_fkey" FOREIGN KEY ("metaPixelId") REFERENCES "MetaPixel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaPixelProduct" ADD CONSTRAINT "MetaPixelProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaEvent" ADD CONSTRAINT "MetaEvent_metaPixelId_fkey" FOREIGN KEY ("metaPixelId") REFERENCES "MetaPixel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetaEvent" ADD CONSTRAINT "MetaEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTrackingContext" ADD CONSTRAINT "OrderTrackingContext_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

