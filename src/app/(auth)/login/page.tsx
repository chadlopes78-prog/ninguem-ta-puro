import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/server/auth/session";
import { hasAnyUser } from "@/server/auth/service";
import { AuthShell } from "../auth-shell";
import { getSystemHealth } from "@/server/health";
import { ConfigError } from "@/components/public/config-error";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const health = await getSystemHealth();
  if (!health.ok) return <ConfigError health={health} />;
  if (!(await hasAnyUser())) redirect("/setup");
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  return (
    <AuthShell title="Bem-vindo de volta" subtitle="Inicie sessão para gerir as suas vendas.">
      <LoginForm next={next} />
    </AuthShell>
  );
}
