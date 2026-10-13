import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/server/auth/session";
import { hasAnyUser } from "@/server/auth/service";
import { canUseApp } from "@/server/auth/policy";
import { getSystemHealth } from "@/server/health";
import { ConfigError } from "@/components/public/config-error";
import { AuthShell } from "../auth-shell";
import { RegisterForm } from "./register-form";

export const metadata: Metadata = { title: "Criar conta" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const health = await getSystemHealth();
  if (!health.ok) return <ConfigError health={health} />;
  if (!(await hasAnyUser())) redirect("/setup");
  const user = await getCurrentUser();
  if (user) redirect(canUseApp(user) ? "/dashboard" : "/conta");
  return (
    <AuthShell title="Criar conta" subtitle="Peça acesso à Ninguém Tá Puro para vender os seus produtos.">
      <RegisterForm />
      <p className="mt-5 text-center text-sm text-muted">
        Já tem conta?{" "}
        <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">
          Iniciar sessão
        </Link>
      </p>
    </AuthShell>
  );
}
