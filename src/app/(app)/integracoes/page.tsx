import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Plug, Settings2 } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { listGateways, recentIntegrationLogs } from "@/server/services/integrations";
import { listMetaPixels } from "@/server/services/meta-capi";
import { scopeOf } from "@/server/scope";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { IntegrationLogo, STATUS_TONE } from "./integration-parts";
import { setGatewayEnabledAction, setMetaEnabledAction } from "./actions";

export const metadata: Metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

interface CardData {
  id: string;
  name: string;
  description: string;
  status: { label: string; tone: Tone; value: string };
  meta?: string;
  toggle?: { enabled: boolean; action: () => Promise<unknown>; disabled?: boolean; name: string };
}

function IntegrationCard({ c }: { c: CardData }) {
  return (
    <Card className="flex h-full flex-col gap-4 p-5" data-testid={`integration-${c.id}`}>
      <div className="flex items-start gap-3">
        <IntegrationLogo id={c.id} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-[15px] font-semibold text-fg">{c.name}</h3>
            <Badge tone={c.status.tone} dot>
              <span data-testid="integration-status" data-status={c.status.value}>
                {c.status.label}
              </span>
            </Badge>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-muted">{c.description}</p>
          {c.meta && <p className="mt-1 text-[12px] text-subtle">{c.meta}</p>}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Link
          href={`/integracoes/${c.id}`}
          className="inline-flex h-10 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface-3 px-4 text-[13px] font-medium text-fg hover:bg-surface-hover"
          data-testid={`configure-${c.id}`}
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" /> Configurar <ChevronRight className="h-4 w-4 text-subtle" aria-hidden="true" />
        </Link>
        {c.toggle &&
          (c.toggle.enabled ? (
            <ActionButton
              size="sm"
              variant="ghost"
              className="h-10"
              action={c.toggle.action as () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>}
              confirm={{ title: `Desativar ${c.toggle.name}`, description: "A configuração e as credenciais ficam guardadas. Pode voltar a ativar quando quiser.", confirmLabel: "Desativar" }}
              data-testid={`toggle-${c.id}`}
            >
              Desativar
            </ActionButton>
          ) : (
            <ActionButton size="sm" variant="ghost" className="h-10" action={c.toggle.action as () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>} disabled={c.toggle.disabled} data-testid={`toggle-${c.id}`}>
              Ativar
            </ActionButton>
          ))}
      </div>
    </Card>
  );
}

export default async function IntegrationsPage() {
  const user = await requireUser();
  // integrações e registos apenas da conta autenticada
  const [gateways, logs, settings, pixels] = await Promise.all([listGateways(user.id), recentIntegrationLogs(user.id), getSettings(user.id), listMetaPixels(scopeOf(user.id, false))]);
  const tz = settings.timezone;
  const metaActive = pixels.some((p) => p.enabled && p.productIds.length > 0);
  const payments: CardData[] = gateways.map((g) => ({
    id: g.id,
    name: g.name,
    description: g.description,
    status: { label: g.statusLabel, tone: STATUS_TONE[g.status], value: g.status },
    meta: g.methods.length ? g.methods.join(" · ") : g.id === "epay" ? "M-Pesa · e-Mola · IZI" : undefined,
    toggle: { enabled: g.enabled, action: setGatewayEnabledAction.bind(null, g.id, !g.enabled), disabled: !g.configured, name: g.name },
  }));
  const tracking: CardData[] = [
    {
      id: "meta",
      name: "Facebook Pixel / API de Conversões",
      description: "Envia as compras confirmadas dos produtos escolhidos para o seu Pixel.",
      status: metaActive ? { label: "Ativa", tone: "success", value: "active" } : { label: pixels.length ? "Inativa" : "Por configurar", tone: pixels.length ? "neutral" : "warning", value: "inactive" },
      meta: pixels.length ? `${pixels.length} Pixel(s) · ${new Set(pixels.flatMap((p) => p.productIds)).size} produto(s)` : undefined,
      toggle: pixels.length ? { enabled: pixels.some((p) => p.enabled), action: setMetaEnabledAction.bind(null, !pixels.some((p) => p.enabled)), name: "o Pixel da Meta" } : undefined,
    },
  ];
  const activePayments = gateways.filter((g) => g.status === "active").length;

  return (
    <>
      <PageHeader title="Integrações" description="Pagamentos e rastreamento. As credenciais ficam cifradas no servidor e nunca são mostradas." />

      <section aria-labelledby="payments-title">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="payments-title" className="font-display text-lg font-semibold">
            Pagamentos
          </h2>
          <p className="text-[12.5px] text-muted" data-testid="payments-summary">
            {activePayments ? `${activePayments} gateway(s) ativo(s) no checkout` : "Nenhum gateway ativo: o checkout não aceita pagamentos"}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {payments.map((c) => (
            <IntegrationCard key={c.id} c={c} />
          ))}
        </div>
      </section>

      <section aria-labelledby="tracking-title" className="mt-8">
        <h2 id="tracking-title" className="mb-3 font-display text-lg font-semibold">
          Rastreamento de anúncios
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {tracking.map((c) => (
            <IntegrationCard key={c.id} c={c} />
          ))}
        </div>
      </section>

      <details className="mt-8 rounded-[var(--radius-lg)] border border-line bg-surface" data-testid="integration-logs">
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-5 text-[14px] font-medium">
          <Plug className="h-4 w-4 text-subtle" aria-hidden="true" /> Registo de integrações <span className="text-[12px] font-normal text-subtle">(últimas 20 entradas, sem dados sensíveis)</span>
        </summary>
        {logs.length === 0 ? (
          <p className="border-t border-line px-5 py-4 text-sm text-subtle">Sem registos.</p>
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-[13px]">
                <span className="tabular text-subtle">{formatDate(l.createdAt, tz, true)}</span>
                <Badge tone={l.level === "warn" ? "warning" : l.level === "error" ? "danger" : "neutral"}>{l.provider}</Badge>
                <span className="min-w-0 text-muted [overflow-wrap:anywhere]">{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </>
  );
}
