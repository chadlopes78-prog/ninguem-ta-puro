"use client";

import { LogoMark } from "@/components/layout/logo";

// Erro inesperado: mensagem útil sem revelar detalhes internos. O "digest" ajuda a encontrar o erro nos logs do servidor.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <div className="max-w-md text-center">
        <LogoMark className="mx-auto h-10 w-10" />
        <h1 className="mt-5 font-display text-xl font-semibold">Ocorreu um erro inesperado</h1>
        <p className="mt-2 text-sm text-muted">
          Tente novamente. Se persistir, consulte <code>/api/health</code> e os logs do servidor
          {error.digest ? (
            <>
              {" "}
              (referência <code>{error.digest}</code>)
            </>
          ) : null}
          .
        </p>
        <button onClick={reset} className="mt-6 h-10 rounded-[var(--radius-md)] bg-accent px-5 text-sm font-semibold text-accent-ink">
          Tentar novamente
        </button>
      </div>
    </main>
  );
}
