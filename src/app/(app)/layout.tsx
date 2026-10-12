import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { AppShell } from "@/components/layout/app-shell";
import { logoutAction } from "../(auth)/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  return (
    <AppShell user={user} businessName={settings.businessName} demoMode={settings.demoMode} logoutAction={logoutAction}>
      {children}
    </AppShell>
  );
}
