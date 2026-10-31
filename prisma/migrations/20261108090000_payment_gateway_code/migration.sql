-- código original do erro e mensagem do gateway para o comprador (auditoria e checkout)
ALTER TABLE "Payment" ADD COLUMN "gatewayCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "buyerMessage" TEXT;
