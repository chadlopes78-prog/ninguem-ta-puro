// Partes partilhadas da aba Integrações (visão geral + páginas de configuração). Componentes de servidor:
// nunca recebem nem mostram valores de credenciais — apenas fragmentos mascarados vindos do servidor.
import { randomBytes } from "crypto";
import { CheckCircle2, CreditCard, Facebook, Smartphone, XCircle, type LucideIcon } from "lucide-react";
import type { GatewayStatus } from "@/server/payments/gateways";
import type { GatewayView } from "@/server/services/integrations";
import type { Tone } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

export const STATUS_TONE: Record<GatewayStatus, Tone> = { active: "success", inactive: "neutral", credentials_missing: "warning", config_error: "danger", unverified: "warning" };

export const INTEGRATION_ICON: Record<string, { icon: LucideIcon; bg: string; fg: string }> = {
  epay: { icon: CreditCard, bg: "#0f766e22", fg: "#2dd4bf" },
  e2payments: { icon: Smartphone, bg: "#c2410c22", fg: "#fb923c" },
  meta: { icon: Facebook, bg: "#1d4ed822", fg: "#60a5fa" },
};

export function IntegrationLogo({ id, className }: { id: string; className?: string }) {
  const v = INTEGRATION_ICON[id] ?? INTEGRATION_ICON.epay;
  const Icon = v.icon;
  return (
    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)]", className)} style={{ background: v.bg, color: v.fg }} aria-hidden="true">
      <Icon className="h-5 w-5" />
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
