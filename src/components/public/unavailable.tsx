import { LogoMark } from "@/components/layout/logo";

/** Página de indisponibilidade genérica — não revela informação interna. */
export function Unavailable({ title = "Link indisponível", message = "Este link de pagamento não existe ou não está disponível de momento." }: { title?: string; message?: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <LogoMark className="mx-auto h-10 w-10 opacity-80" />
        <h1 className="mt-6 font-display text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </div>
    </main>
  );
}
