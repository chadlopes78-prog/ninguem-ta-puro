import Link from "next/link";
import type { Metadata } from "next";
import { checkResetToken } from "@/server/auth/password-reset";
import { AuthShell } from "../../auth-shell";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Redefinir palavra-passe", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = await checkResetToken(token);
  return (
    <AuthShell title="Definir nova palavra-passe" subtitle={valid ? "Escolha uma palavra-passe com pelo menos 10 caracteres. Todas as sessões abertas serão terminadas." : undefined}>
      {valid ? (
        <ResetForm token={token} />
      ) : (
        <div className="flex flex-col gap-4 text-center" data-testid="reset-invalid">
          <p className="text-sm text-muted">Este link é inválido, expirou ou já foi usado.</p>
          <Link href="/recuperar" className="font-medium text-fg underline-offset-4 hover:underline">
            Pedir um novo link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
