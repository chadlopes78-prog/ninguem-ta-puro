import { redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/server/auth/session";
import { canUseApp } from "@/server/auth/policy";
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
  const user = await getCurrentUser();
  if (user) redirect(canUseApp(user) ? "/dashboard" : "/conta");
  const { next } = await searchParams;
  return (
    <AuthShell title="Bem-vindo de volta" subtitle="Inicie sessão para gerir as suas vendas.">
      <LoginForm next={next} />
      <p className="mt-4 text-center text-sm">
        <Link href="/recuperar" className="text-muted underline-offset-4 hover:text-fg hover:underline" data-testid="forgot-link">
          Esqueceu-se da palavra-passe?
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-muted">
        Ainda não tem conta?{" "}
        <Link href="/registo" className="font-medium text-fg underline-offset-4 hover:underline" data-testid="register-link">
          Criar conta
        </Link>
      </p>
    </AuthShell>
  );
}
