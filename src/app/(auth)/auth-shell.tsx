import { LogoMark } from "@/components/layout/logo";

export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_50%_-10%,rgb(200_241_53/0.10),transparent_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgb(255_255_255/0.025)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="relative w-full max-w-[400px] animate-slide-up">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark className="h-11 w-11" />
          <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
        </div>
        <div className="rounded-[var(--radius-xl)] border border-line bg-surface/90 p-6 shadow-[var(--shadow-pop)] backdrop-blur">{children}</div>
        <p className="mt-6 text-center text-[12px] text-subtle">Ninguém Tá Puro · Plataforma privada</p>
      </div>
    </main>
  );
}
