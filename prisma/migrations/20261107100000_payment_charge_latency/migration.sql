-- tempo de resposta do gateway ao criar a cobrança (monitorização)
ALTER TABLE "Payment" ADD COLUMN "chargeLatencyMs" INTEGER;
