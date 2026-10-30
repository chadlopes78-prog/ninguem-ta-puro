import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { AppShell } from "@/components/layout/app-shell";
import { logoutAction } from "../(auth)/actions";
import { prisma } from "@/server/db";
import { isPanelTheme } from "@/lib/panel-theme";
import { setThemePreferenceAction } from "./theme-actions";
import { canAdminister } from "@/server/auth/policy";
import { after } from "next/server";
import { unreadCount, runNotificationJobs } from "@/server/notifications/service";
import { reconcileStalePayments } from "@/server/services/payment-flow";

export const dynamic = "force-dynamic";

/** Nome global da plataforma (não é configurável por utilizador). */
const PLATFORM_NAME = "Ninguém Tá Puro";

// As tarefas de notificações (push pendente, resumo diário) não precisam de correr em cada navegação:
// no máximo uma vez a cada 5 minutos por instância (o cron diário continua a garantir a execução).
const JOBS_INTERVAL_MS = 5 * 60_000;
let lastJobsRun = 0;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const isOwner = canAdminister(user);
  // Consultas independentes em paralelo (cada ida à BD custa a latência Vercel ↔ BD)
  const [settings, unread, pendingApprovals] = await Promise.all([
    getSettings(user.id),
    unreadCount(user.id),
    isOwner ? prisma.user.count({ where: { status: "PENDING_APPROVAL", bannedAt: null } }) : Promise.resolve(0),
  ]);
  if (Date.now() - lastJobsRun > JOBS_INTERVAL_MS) {
    lastJobsRun = Date.now();
    // Depois da resposta: envia push pendente e gera o resumo diário em falta (não depende só do cron)
    after(() => runNotificationJobs().catch((e) => console.error("[notificações] tarefas", e)));
    // reconciliação dos pagamentos pendentes junto dos gateways (resultado definitivo que não chegou por aviso)
    after(() => reconcileStalePayments().catch((e) => console.error("[pagamentos] reconciliação", e)));
  }
  const theme = isPanelTheme(user.themePreference) ? user.themePreference : "system";
  return (
    <AppShell user={{ name: user.name, email: user.email }} businessName={PLATFORM_NAME} demoMode={settings.demoMode} logoutAction={logoutAction} theme={theme} saveTheme={setThemePreferenceAction} unread={unread} isOwner={isOwner} pendingApprovals={pendingApprovals}>
      {children}
    </AppShell>
  );
}
