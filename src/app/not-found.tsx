import { LinkButton } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="text-center">
        <LogoMark className="mx-auto h-10 w-10" />
        <p className="mt-6 font-display text-5xl font-semibold text-fg">404</p>
        <h1 className="mt-2 text-lg text-fg">Página não encontrada</h1>
        <p className="mt-1 text-sm text-muted">O endereço não existe ou deixou de estar disponível.</p>
        <LinkButton href="/" variant="secondary" className="mt-6">
          Voltar ao início
        </LinkButton>
      </div>
    </main>
  );
}
