import { CheckCircle2, XCircle } from "lucide-react";
import type { SystemHealth } from "@/server/health";
import { LogoMark } from "@/components/layout/logo";

const DB_MESSAGE: Record<SystemHealth["database"], string> = {
  ok: "Base de dados ligada.",
  missing_url: "A variável DATABASE_URL não está definida no servidor.",
  unreachable: "Não foi possível ligar à base de dados indicada em DATABASE_URL (endereço, credenciais ou SSL).",
  not_migrated: "A base de dados está ligada, mas as tabelas ainda não foram criadas (migrações por aplicar).",
};

/** Página mostrada quando a instalação está incompleta, em vez de um erro genérico. */
export function ConfigError({ health }: { health: SystemHealth }) {
  const items = [
    { label: "DATABASE_URL", ok: health.env.DATABASE_URL, hint: "Ligação PostgreSQL (Vercel → Storage → Neon/Postgres → Connect)." },
    { label: "Base de dados", ok: health.database === "ok", hint: DB_MESSAGE[health.database] },
    { label: "APP_BASE_URL", ok: health.env.APP_BASE_URL, hint: "URL público, ex.: https://ninguem-ta-puro.vercel.app" },
    { label: "EPAY_SECRET_KEY", ok: health.env.EPAY_SECRET_KEY, hint: "Opcional para arrancar; necessária para receber pagamentos." },
  ];
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <LogoMark className="h-10 w-10" />
        <h1 className="mt-5 font-display text-2xl font-semibold">Configuração incompleta</h1>
        <p className="mt-1.5 text-sm text-muted">A aplicação arrancou, mas falta configurar o servidor. Nenhum valor secreto é apresentado nesta página.</p>
        <ul className="mt-6 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-line bg-surface p-4">
          {items.map((i) => (
            <li key={i.label} className="flex gap-3 text-sm">
              {i.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="OK" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Em falta" />}
              <span>
                <code className="text-fg">{i.label}</code>
                <span className="block text-[12.5px] text-muted">{i.hint}</span>
              </span>
            </li>
          ))}
        </ul>
        <ol className="mt-6 flex list-decimal flex-col gap-1.5 pl-5 text-[13px] text-muted">
          <li>Na Vercel: Project → Storage → criar/ligar uma base de dados Postgres (define DATABASE_URL automaticamente).</li>
          <li>Settings → Environment Variables: definir APP_BASE_URL (e EPAY_SECRET_KEY quando tiver a chave).</li>
          <li>Deployments → Redeploy. O build aplica as migrações (cria as tabelas) automaticamente.</li>
          <li>Abrir /setup para criar a conta de proprietário.</li>
        </ol>
      </div>
    </main>
  );
}
