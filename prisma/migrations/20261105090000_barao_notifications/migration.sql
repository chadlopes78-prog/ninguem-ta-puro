-- Notificações BARÃO: mensagens da manhã, da noite e resumo semanal (apenas adições)
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MORNING_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'EVENING_MESSAGE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'WEEKLY_SUMMARY';

ALTER TABLE "NotificationPreference" ADD COLUMN "morning" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "evening" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "NotificationPreference" ADD COLUMN "weeklySummary" BOOLEAN NOT NULL DEFAULT true;
