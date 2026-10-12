import type { Metadata } from "next";
import { Plug } from "lucide-react";
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
  return (
    <>
      <PageHeader title="Integrações" description="Processadores de pagamento e serviços externos." />
      <Alert tone={paymentsEnabled() ? "success" : "warning"} className="mb-6" title={paymentsEnabled() ? "Pagamentos ativos" : "Pagamentos reais desativados"}>
        Nenhum processador de pagamento está integrado nesta fase. Os checkouts informam o comprador de que o pagamento não está disponível e não recolhem dados de cartão. A arquitetura (abstração de fornecedores, eventos assinados, idempotência e registo) está preparada para a integração posterior.
      </Alert>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((i) => (
          <Card key={i.id} className="flex flex-col">
            <CardHeader
              title={i.name}
              description={`${i.regions} · ${i.methods}`}
              action={i.status === "CONFIGURED" ? <Badge tone="success" dot>Configurado</Badge> : <Badge>Não configurado</Badge>}
            />
            <CardBody className="flex flex-1 flex-col gap-3 text-sm">
              <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
                <dt className="text-muted">Implementação</dt>
                <dd>{i.implemented ? "Disponível" : "Por implementar"}</dd>
                <dt className="text-muted">Ambiente</dt>
                <dd>{i.environment === "SANDBOX" ? "Testes (sandbox)" : "Produção"}</dd>
                <dt className="text-muted">Última verificação</dt>
                <dd>{i.lastCheckedAt ? formatDate(i.lastCheckedAt, tz, true) : "Nunca"}</dd>
              </dl>
              {i.lastError && <p className="rounded-[var(--radius-md)] bg-surface-2 p-2.5 text-[12.5px] text-muted">{i.lastError}</p>}
              <p className="text-[12.5px] text-subtle">
                Para ativar: implementar o fornecedor em <code className="text-muted">src/server/payments/providers/{i.id}.ts</code>, definir as credenciais em variáveis de ambiente e configurar o webhook <code className="text-muted">/api/webhooks/{i.id}</code>.
              </p>
              <div className="mt-auto">
                <ActionButton size="sm" variant="secondary" action={checkIntegrationAction.bind(null, i.id)}>Verificar estado</ActionButton>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader title="Registo de integrações" description="Últimas 20 entradas" />
        {logs.length === 0 ? (
          <div className="flex items-center gap-3 p-5 text-sm text-subtle"><Plug className="h-4 w-4" /> Sem registos.</div>
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
