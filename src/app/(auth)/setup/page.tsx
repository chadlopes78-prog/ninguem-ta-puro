import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { hasAnyUser } from "@/server/auth/service";
import { AuthShell } from "../auth-shell";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Configuração inicial" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await hasAnyUser()) redirect("/login");
  return (
    <AuthShell title="Configuração inicial" subtitle="Crie a conta de proprietário. Este passo só está disponível uma vez.">
      <SetupForm />
    </AuthShell>
  );
}
