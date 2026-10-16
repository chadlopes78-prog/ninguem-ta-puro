-- Página de obrigado personalizada por checkout (aditiva; nenhum dado existente é alterado)
CREATE TABLE "CheckoutThankYou" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB,
    "publishedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CheckoutThankYou_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CheckoutThankYou_checkoutId_key" ON "CheckoutThankYou"("checkoutId");
ALTER TABLE "CheckoutThankYou" ADD CONSTRAINT "CheckoutThankYou_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
