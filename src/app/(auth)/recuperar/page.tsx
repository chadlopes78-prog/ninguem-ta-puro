import Link from "next/link";
import type { Metadata } from "next";
import { AuthShell } from "../auth-shell";
import { RequestResetForm } from "./request-form";

export const metadata: Metadata = { title: "Recuperar palavra-passe" };
export const dynamic = "force-dynamic";

export default function RecoverPage() {
  return (
    <AuthShell title="Esqueceu-se da palavra-passe?" subtitle="Indique o email da sua conta. Enviamos um link temporário para definir uma nova palavra-passe.">
      <RequestResetForm />
      <p className="mt-5 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-fg underline-offset-4 hover:underline">
          Voltar a iniciar sessão
        </Link>
      </p>
    </AuthShell>
  );
}
