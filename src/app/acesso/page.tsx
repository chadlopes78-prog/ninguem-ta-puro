import type { Metadata } from "next";
import { KeyRound } from "lucide-react";
import { RecoverAccessForm } from "./recover-form";

export const metadata: Metadata = { title: "Recuperar acesso", robots: { index: false } };

export default function RecoverAccessPage() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <KeyRound className="mx-auto h-10 w-10 text-accent" aria-hidden="true" />
        <h1 className="mt-5 text-center font-display text-2xl font-semibold">Recuperar o acesso aos seus produtos</h1>
        <p className="mt-2 text-center text-sm text-muted">Use o email da compra e o código da encomenda (aparece na página de obrigado, ex.: NTP-AB12CD34). Sem o código, use o número de telemóvel do pagamento.</p>
        <RecoverAccessForm />
      </div>
    </main>
  );
}
