-- Classificação normalizada do resultado de cada tentativa de pagamento (aditiva: só colunas opcionais novas).
-- failureCode: CUSTOMER_CANCELLED | INSUFFICIENT_FUNDS | WRONG_PIN | TIMEOUT | GATEWAY_ERROR | NOT_STARTED | UNKNOWN
-- gatewayMessage: motivo exatamente como o gateway o devolveu (auditoria; sem dados pessoais)
ALTER TABLE "Payment" ADD COLUMN "failureCode" TEXT;
ALTER TABLE "Payment" ADD COLUMN "gatewayMessage" TEXT;
