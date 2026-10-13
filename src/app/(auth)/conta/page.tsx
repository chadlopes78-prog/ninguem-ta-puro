import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Ban, Hourglass, LogOut, RefreshCw, XCircle } from "lucide-react";
import { getCurrentUser } from "@/server/auth/session";
import { accountState } from "@/server/auth/policy";
import { formatDate } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";
import { LogoMark } from "@/components/layout/logo";
import { logoutAction } from "../actions";

export const metadata: Metadata = { title: "Estado da conta" };
export const dynamic = "force-dynamic";

const CONTENT = {
  pending: {
    icon: Hourglass,
    tone: "text-warning bg-warning/10 border-warning/25",
    badge: "Em análise",
    title: "A sua conta está pendente de aprovação",
    text: "Recebemos o seu pedido de acesso à Ninguém Tá Puro. O proprietário irá analisar a sua candidatura. Assim que a sua conta for aprovada, poderá entrar na plataforma com o e-mail e a palavra-passe utilizados no registo.",
  },
  rejected: {
    icon: XCircle,
    tone: "text-danger bg-danger/10 border-danger/25",
    badge: "Rejeitada",
    title: "A sua candidatura foi rejeitada",
    text: "Lamentamos informar que o seu pedido de acesso à Ninguém Tá Puro não foi aprovado. Neste momento, não tem autorização para entrar na plataforma.",
  },
  banned: {
    icon: Ban,
    tone: "text-danger bg-danger/10 border-danger/25",
    badge: "Suspensa",
    title: "A sua conta foi suspensa",
    text: "O acesso à sua conta Ninguém Tá Puro foi suspenso pelo administrador da plataforma. Se considerar que esta decisão foi um engano, entre em contacto com o suporte.",
  },
} as const;

/**
 * Página de estado para contas sem acesso ao painel (pendentes, rejeitadas ou suspensas).
 * O estado vem sempre da base de dados; quando a conta é aprovada, esta página encaminha para o Dashboard.
 */
export default async function AccountStatusPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const state = accountState(user);
  if (state === "approved") redirect("/dashboard");
  const c = CONTENT[state];
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_300px_at_50%_-10%,rgb(200_241_53/0.10),transparent_70%)]" />
      <div className="relative w-full max-w-[460px] animate-slide-up">
        <div className="mb-6 flex justify-center">
          <LogoMark className="h-10 w-10" />
        </div>
        <section className="rounded-[var(--radius-xl)] border border-line bg-surface/90 p-6 text-center shadow-[var(--shadow-pop)] backdrop-blur sm:p-8" data-testid="account-status" data-state={state}>
          <span className={`mx-auto grid h-14 w-14 place-items-center rounded-full border ${c.tone}`}>
            <c.icon className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-5 font-display text-[22px] font-semibold leading-tight tracking-tight text-fg" data-testid="account-status-title">
            {c.title}
          </h1>
          <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{c.text}</p>
          <dl className="mt-6 grid gap-2 rounded-[var(--radius-md)] border border-line bg-surface-2 px-4 py-3 text-left text-sm">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">Estado atual</dt>
              <dd className="font-medium text-fg" data-testid="account-status-badge">{c.badge}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-muted">Conta</dt>
              <dd className="min-w-0 break-all font-medium text-fg">{user.email}</dd>
            </div>
            {state === "banned" && user.bannedAt && (
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-muted">Desde</dt>
                <dd className="text-fg">{formatDate(user.bannedAt, "Africa/Maputo", true)}</dd>
              </div>
            )}
          </dl>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {/* navegação completa (não do router do cliente): o estado é sempre relido da base de dados */}
            <a href="/conta" className={buttonClass("secondary")} data-testid="account-status-refresh">
              <RefreshCw className="h-4 w-4" /> Verificar novamente
            </a>
            <form action={logoutAction}>
              <button type="submit" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-medium text-muted hover:bg-surface-2 hover:text-fg sm:w-auto" data-testid="account-status-logout">
                <LogOut className="h-4 w-4" /> Sair da conta
              </button>
            </form>
          </div>
        </section>
        <p className="mt-6 text-center text-[12px] text-subtle">Ninguém Tá Puro · Plataforma privada</p>
      </div>
    </main>
  );
}
