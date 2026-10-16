-- Entrega por ficheiro (aditiva): novo método FILE e ficheiro entregue por produto. Nenhum dado é alterado.
ALTER TYPE "DeliveryMethod" ADD VALUE IF NOT EXISTS 'FILE';

ALTER TABLE "Product" ADD COLUMN "deliveryFileId" TEXT;

ALTER TABLE "Product" ADD CONSTRAINT "Product_deliveryFileId_fkey" FOREIGN KEY ("deliveryFileId") REFERENCES "ProductFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
