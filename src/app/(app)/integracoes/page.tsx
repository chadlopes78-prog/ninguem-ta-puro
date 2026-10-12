import type { Metadata } from "next";
import { CheckCircle2, Plug, XCircle } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { listIntegrations, recentIntegrationLogs } from "@/server/services/integrations";
import { paymentsEnabled } from "@/server/payments/registry";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionButton } from "@/components/ui/action-button";
import { checkIntegrationAction } from "./actions";

export const metadata: Metadata = { title: "Integrações" };

export default async function IntegrationsPage() {
  await requireUser();
  const [items, logs, settings] = await Promise.all([listIntegrations(), recentIntegrationLogs(), getSettings()]);
  const tz = settings.timezone;
  const enabled = paymentsEnabled();
  return (
    <>
      <PageHeader title="Integrações" description="Processador de pagamentos e serviços externos. Os segredos ficam apenas no servidor e nunca são apresentados." />
      <Alert tone={enabled ? "success" : "warning"} className="mb-6" title={enabled ? "Pagamentos ativos" : "Pagamentos reais ainda não ativos"}>
        {enabled
          ? "Os checkouts criam encomendas pendentes e só as marcam como pagas após confirmação oficial do processador."
          : "Os checkouts informam o comprador de que o pagamento não está disponível. Nada é cobrado até a integração estar completa e configurada."}
      </Alert>
      <div className="grid grid-cols-1 gap-4">
        {items.map((i) => (
          <Card key={i.id}>
            <CardHeader
              title={i.name}
              description={`${i.regions} · ${i.methods}`}
              action={i.configured ? <Badge tone="success" dot>Ativo</Badge> : <Badge>Não ativo</Badge>}
            />
            <CardBody className="grid grid-cols-1 gap-5 text-sm lg:grid-cols-2">
              <div>
                <p className="mb-2 text-[12px] font-medium uppercase tracking-wider text-subtle">Configuração no servidor</p>
                <ul className="flex flex-col gap-2" data-testid={`checks-${i.id}`}>
                  {i.checks.map((c) => (
                    <li key={c.label} className="flex items-start gap-2">
                      {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="OK" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-label="Em falta" />}
                      <span>
                        <code className="break-all text-fg">{c.label}</code>
                        <span className="block text-[12.5px] text-muted">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[12px] text-subtle">Última verificação: {i.lastCheckedAt ? formatDate(i.lastCheckedAt, tz, true) : "nunca"}</p>
                <div className="mt-3">
                  <ActionButton size="sm" variant="secondary" action={checkIntegrationAction.bind(null, i.id)}>
                    Verificar configuração
                  </ActionButton>
                </div>
              </div>
              {i.pendingContract.length > 0 && (
                <div>
                  <p className="mb-2 text-[12px] font-medium uppercase tracking-wider text-subtle">A confirmar na documentação oficial</p>
                  <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[12.5px] text-muted">
                    {i.pendingContract.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ol>
                </div>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader title="Registo de integrações" description="Últimas 20 entradas (sem dados sensíveis)" />
        {logs.length === 0 ? (
          <div className="flex items-center gap-3 p-5 text-sm text-subtle">
            <Plug className="h-4 w-4" /> Sem registos.
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-[13px]">
                <span className="tabular text-subtle">{formatDate(l.createdAt, tz, true)}</span>
                <Badge tone={l.level === "warn" ? "warning" : l.level === "error" ? "danger" : "neutral"}>{l.provider}</Badge>
                <span className="text-muted">{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
