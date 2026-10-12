-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "isTestPayment" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "environment" TEXT,
ADD COLUMN     "redirectUrl" TEXT;

