-- Metas de faturamento celebradas no Dashboard (aditiva: não altera dados existentes)
CREATE TABLE "RevenueMilestone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "celebratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RevenueMilestone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RevenueMilestone_userId_amountCents_key" ON "RevenueMilestone"("userId", "amountCents");

ALTER TABLE "RevenueMilestone" ADD CONSTRAINT "RevenueMilestone_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
