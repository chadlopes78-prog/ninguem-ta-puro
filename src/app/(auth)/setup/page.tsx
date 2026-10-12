import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { hasAnyUser } from "@/server/auth/service";
import { AuthShell } from "../auth-shell";
import { getSystemHealth } from "@/server/health";
import { ConfigError } from "@/components/public/config-error";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Configuração inicial" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const health = await getSystemHealth();
  if (!health.ok) return <ConfigError health={health} />;
  if (await hasAnyUser()) redirect("/login");
  return (
    <AuthShell title="Configuração inicial" subtitle="Crie a conta de proprietário. Este passo só está disponível uma vez.">
      <SetupForm />
    </AuthShell>
  );
}
