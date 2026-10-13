import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { AppShell } from "@/components/layout/app-shell";
import { logoutAction } from "../(auth)/actions";
import { prisma } from "@/server/db";
import { isPanelTheme } from "@/lib/panel-theme";
import { setThemePreferenceAction } from "./theme-actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [settings, prefs] = await Promise.all([getSettings(), prisma.user.findUnique({ where: { id: user.id }, select: { themePreference: true } })]);
  const theme = isPanelTheme(prefs?.themePreference) ? prefs.themePreference : "system";
  return (
    <AppShell user={user} businessName={settings.businessName} demoMode={settings.demoMode} logoutAction={logoutAction} theme={theme} saveTheme={setThemePreferenceAction}>
      {children}
    </AppShell>
  );
}
