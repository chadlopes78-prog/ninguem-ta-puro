// Partes partilhadas da aba Integrações (visão geral + páginas de configuração). Componentes de servidor:
// nunca recebem nem mostram valores de credenciais — apenas fragmentos mascarados vindos do servidor.
import { randomBytes } from "crypto";
import { CheckCircle2, XCircle } from "lucide-react";
import type { GatewayStatus } from "@/server/payments/gateways";
import type { GatewayView } from "@/server/services/integrations";
import type { Tone } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

export const STATUS_TONE: Record<GatewayStatus, Tone> = { active: "success", inactive: "neutral", credentials_missing: "warning", config_error: "danger", unverified: "warning" };

/** Logótipos oficiais com fundo transparente (em /public/integrations), apresentados sem fundo. */
export const INTEGRATION_LOGO: Record<string, { src: string; alt: string }> = {
  epay: { src: "/integrations/epay.png", alt: "EPay" },
  e2payments: { src: "/integrations/e2payments.png", alt: "E2Payments" },
  meta: { src: "/integrations/facebook.png", alt: "Facebook" },
};

/** Integrações sem logótipo oficial no projeto: mostra-se o nome (nunca o logótipo de outra marca). */
const TEXT_LOGO: Record<string, string> = { pagar: "Pagar" };

export function IntegrationLogo({ id, className }: { id: string; className?: string }) {
  const logo = INTEGRATION_LOGO[id];
  if (!logo) {
    return (
      <span className={cn("grid h-12 w-16 shrink-0 place-items-center rounded-[var(--radius-md)] border border-line bg-surface-2 font-display text-[13px] font-semibold text-fg", className)} data-testid={`logo-${id}`}>
        {TEXT_LOGO[id] ?? id}
      </span>
    );
  }
  return (
    <span className={cn("grid h-12 w-16 shrink-0 place-items-center", className)} data-testid={`logo-${id}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logo.src} alt={logo.alt} className="max-h-full max-w-full object-contain" loading="lazy" decoding="async" />
    </span>
  );
}

export function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}

export function Checks({ g }: { g: GatewayView }) {
  return (
    <ul className="flex flex-col gap-2" data-testid={`checks-${g.id}`}>
      {g.checks.map((c) => (
        <li key={c.label} className="flex items-start gap-2 text-[13px]">
          {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="OK" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Em falta" />}
          <span>
            <code className="break-all text-fg">{c.label}</code>
            <span className="block text-[12.5px] text-muted">{c.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Secção recolhida para explicações técnicas (não ocupa a página principal). */
export function Details({ title, children, testId }: { title: string; children: React.ReactNode; testId?: string }) {
  return (
    <details className="group rounded-[var(--radius-md)] border border-line text-[13px]" data-testid={testId}>
      <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium text-fg">{title}</summary>
      <div className="border-t border-line px-4 py-3 text-[12.5px] leading-relaxed text-muted">{children}</div>
    </details>
  );
}

/** Sem chave de cifra no servidor: não é possível guardar credenciais pela interface. */
export function KeySetup() {
  // Chave aleatória gerada agora, só para facilitar: não é guardada em lado nenhum.
  const suggestion = randomBytes(32).toString("base64");
  return (
    <div className="rounded-[var(--radius-md)] border border-warning/30 bg-warning/[0.06] p-3 text-[12.5px] leading-relaxed text-muted" data-testid="e2payments-key-setup">
      <p className="font-medium text-fg">Falta um passo para guardar credenciais aqui</p>
      <p className="mt-1">
        Adicione no alojamento (Vercel → Settings → Environment Variables) a variável <code className="text-fg">INTEGRATIONS_ENCRYPTION_KEY</code> com um valor aleatório e volte a publicar. Pode usar este:
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-[11.5px] text-fg">{suggestion}</code>
        <CopyButton value={suggestion} size="icon" label="Copiar chave gerada" />
      </div>
    </div>
  );
}
