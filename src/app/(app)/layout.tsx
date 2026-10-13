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

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [settings, prefs, unread] = await Promise.all([getSettings(user.id), prisma.user.findUnique({ where: { id: user.id }, select: { themePreference: true } }), unreadCount(user.id)]);
  // Depois da resposta: envia push pendente e gera o resumo diário em falta (não depende só do cron)
  after(() => runNotificationJobs().catch((e) => console.error("[notificações] tarefas", e)));
  const theme = isPanelTheme(prefs?.themePreference) ? prefs.themePreference : "system";
  const isOwner = canAdminister(user);
  const pendingApprovals = isOwner ? await prisma.user.count({ where: { status: "PENDING_APPROVAL", bannedAt: null } }) : 0;
  return (
    <AppShell user={user} businessName={settings.businessName} demoMode={settings.demoMode} logoutAction={logoutAction} theme={theme} saveTheme={setThemePreferenceAction} unread={unread} isOwner={isOwner} pendingApprovals={pendingApprovals}>
      {children}
    </AppShell>
  );
}
