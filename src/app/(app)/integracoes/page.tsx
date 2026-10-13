import type { Metadata } from "next";
import { randomBytes } from "crypto";
import { CheckCircle2, Plug, XCircle } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { listGateways, recentIntegrationLogs, type GatewayView } from "@/server/services/integrations";
import type { GatewayStatus } from "@/server/payments/gateways";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type Tone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionButton } from "@/components/ui/action-button";
import { CopyButton } from "@/components/ui/copy-button";
import { E2PaymentsForm } from "@/components/integrations/e2payments-form";
import { checkIntegrationAction, reconcileAction, saveE2CredentialsAction, setGatewayEnabledAction, testGatewayConnectionAction } from "./actions";

export const metadata: Metadata = { title: "Integrações" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<GatewayStatus, Tone> = { active: "success", inactive: "neutral", credentials_missing: "warning", config_error: "danger", unverified: "warning" };

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-right text-fg">{children}</span>
    </div>
  );
}

function Checks({ g }: { g: GatewayView }) {
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

function GatewayCard({ g, tz }: { g: GatewayView; tz: string }) {
  const ready = g.configured && g.status !== "config_error";
  return (
    <Card className="flex flex-col" data-testid={`gateway-${g.id}`}>
      <CardHeader
        title={g.name}
        description={g.description}
        action={
          <Badge tone={STATUS_TONE[g.status]} dot>
            <span data-testid="gateway-status" data-status={g.status}>{g.statusLabel}</span>
          </Badge>
        }
      />
      <CardBody className="flex flex-1 flex-col gap-4">
        <div className="divide-y divide-line rounded-[var(--radius-md)] border border-line px-3">
          <Info label="Novos pagamentos">{g.enabled ? (g.status === "active" ? "Ativado" : "Ativado, mas indisponível") : "Desativado"}</Info>
          <Info label="Credenciais">{g.configured ? "Configuradas" : "Por configurar"}</Info>
          {g.configured && <Info label="Ambiente">{g.environment === "test" ? "Teste (sandbox)" : "Produção"}</Info>}
          <Info label="Métodos">{g.methods.length ? g.methods.join(", ") : g.id === "epay" ? "M-Pesa, e-Mola e IZI (página da EPay)" : "—"}</Info>
          {g.supportsConnectionTest && <Info label="Ligação">{g.verifiedAt ? `Verificada ${formatDate(g.verifiedAt, tz, true)}` : "Não verificada"}</Info>}
        </div>

        {g.lastError && g.status === "config_error" && (
          <p className="rounded-[var(--radius-md)] border border-danger/30 bg-danger/[0.06] p-2.5 text-[12.5px] text-danger" role="alert">
            {g.lastError}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {g.enabled ? (
            <ActionButton
              size="sm"
              variant="secondary"
              action={setGatewayEnabledAction.bind(null, g.id, false)}
              confirm={{ title: `Desativar ${g.name}`, description: "Deixa de aceitar novos pagamentos. As credenciais, a configuração e o histórico ficam guardados, e os pagamentos já iniciados continuam a ser confirmados.", confirmLabel: "Desativar" }}
            >
              Desativar
            </ActionButton>
          ) : (
            <ActionButton size="sm" action={setGatewayEnabledAction.bind(null, g.id, true)} disabled={!g.configured}>
              Ativar
            </ActionButton>
          )}
          {g.supportsConnectionTest ? (
            <ActionButton size="sm" variant="secondary" action={testGatewayConnectionAction.bind(null, g.id)} disabled={!g.configured}>
              Testar ligação
            </ActionButton>
          ) : (
            <ActionButton size="sm" variant="secondary" action={checkIntegrationAction.bind(null, g.id)}>
              Verificar configuração
            </ActionButton>
          )}
          {g.id === "epay" && ready && (
            <ActionButton size="sm" variant="secondary" action={reconcileAction}>
              Verificar pagamentos pendentes
            </ActionButton>
          )}
        </div>

        <details className="group rounded-[var(--radius-md)] border border-line p-3 text-[13px]">
          <summary className="cursor-pointer font-medium text-fg">Configuração no servidor</summary>
          <div className="mt-3">
            <Checks g={g} />
            <p className="mt-3 text-[12px] text-subtle">Última verificação: {g.lastCheckedAt ? formatDate(g.lastCheckedAt, tz, true) : "nunca"}</p>
          </div>
        </details>

        {g.id === "epay" ? <EPayNotes g={g} /> : <E2Section g={g} />}
      </CardBody>
    </Card>
  );
}

function EPayNotes({ g }: { g: GatewayView }) {
  return (
    <div className="text-[12.5px] leading-relaxed text-muted">
      <p className="mb-2 text-[12px] font-medium uppercase tracking-wider text-subtle">Credenciais</p>
      <p>
        A chave da EPay está guardada no servidor (<code className="text-fg">EPAY_SECRET_KEY</code>) e nunca é apresentada. Para a atualizar, altere a variável nas definições do alojamento (Vercel → Settings → Environment Variables) e volte a publicar. A API da EPay não documenta um teste de ligação.
      </p>
      <p className="mb-2 mt-3 text-[12px] font-medium uppercase tracking-wider text-subtle">Como funciona</p>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        <li>O checkout cria o pagamento na EPay (valor sempre calculado no servidor, em MZN).</li>
        <li>O comprador é enviado para a página segura da EPay e paga com M-Pesa, e-Mola ou IZI.</li>
        <li>A EPay envia um aviso assinado (X-EducavelPay-Signature) para <code className="break-all text-fg">/api/webhooks/epay</code>.</li>
        <li>A encomenda só passa a paga após a assinatura e o valor serem validados — nunca pelo regresso do comprador.</li>
      </ol>
      {g.environment === "test" && <p className="mt-3 rounded-[var(--radius-md)] border border-warning/30 bg-warning/[0.06] p-2.5 text-warning">Chave de teste ativa: os pagamentos são simulados pela EPay e as encomendas ficam marcadas como teste (não contam como receita).</p>}
    </div>
  );
}

function E2Section({ g }: { g: GatewayView }) {
  const e2 = g.e2!;
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-4">
      <p className="text-[12px] font-medium uppercase tracking-wider text-subtle">Credenciais da E2Payments</p>
      {e2.fromEnv ? (
        <p className="text-[12.5px] text-muted">
          Definidas nas variáveis de ambiente do servidor (<code className="text-fg">E2PAYMENTS_CLIENT_ID</code>, <code className="text-fg">E2PAYMENTS_CLIENT_SECRET</code>, <code className="text-fg">E2PAYMENTS_MPESA_WALLET_ID</code>, <code className="text-fg">E2PAYMENTS_EMOLA_WALLET_ID</code>). Para as alterar, edite-as no alojamento.
        </p>
      ) : e2.storageAvailable ? (
        <E2PaymentsForm key={`${e2.clientIdMasked}-${e2.mpesaWalletId}-${e2.emolaWalletId}`} action={saveE2CredentialsAction} initial={e2} />
      ) : (
        <KeySetup />
      )}
      <div className="text-[12.5px] leading-relaxed text-muted">
        <p className="mb-2 text-[12px] font-medium uppercase tracking-wider text-subtle">Como funciona</p>
        <ol className="flex list-decimal flex-col gap-1.5 pl-5">
          <li>O comprador escolhe M-Pesa ou e-Mola no checkout e indica o número.</li>
          <li>O servidor pede a cobrança à E2Payments (valor calculado no servidor) e o comprador confirma no telemóvel.</li>
          <li>A encomenda só fica paga quando a E2Payments responde com sucesso a esse pedido autenticado.</li>
          <li>Sem resposta (tempo esgotado), o pagamento fica “por verificar” no pedido: confirme-o no painel da E2Payments antes de o marcar.</li>
        </ol>
      </div>
    </div>
  );
}

function KeySetup() {
  // Chave aleatória gerada agora, só para facilitar: não é guardada em lado nenhum.
  const suggestion = randomBytes(32).toString("base64");
  return (
    <div className="rounded-[var(--radius-md)] border border-warning/30 bg-warning/[0.06] p-3 text-[12.5px] leading-relaxed text-muted" data-testid="e2payments-key-setup">
      <p className="font-medium text-fg">Falta um passo para poder guardar credenciais aqui</p>
      <p className="mt-1">
        As credenciais são guardadas cifradas. Adicione no alojamento (Vercel → Settings → Environment Variables) a variável <code className="text-fg">INTEGRATIONS_ENCRYPTION_KEY</code> com um valor aleatório e volte a publicar. Pode usar este valor gerado agora:
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded bg-surface-2 px-2 py-1.5 font-mono text-[11.5px] text-fg">{suggestion}</code>
        <CopyButton value={suggestion} size="icon" label="Copiar chave gerada" />
      </div>
      <p className="mt-2">Em alternativa, defina diretamente E2PAYMENTS_CLIENT_ID, E2PAYMENTS_CLIENT_SECRET e E2PAYMENTS_MPESA_WALLET_ID e/ou E2PAYMENTS_EMOLA_WALLET_ID.</p>
    </div>
  );
}

export default async function IntegrationsPage() {
  await requireUser();
  const [gateways, logs, settings] = await Promise.all([listGateways(), recentIntegrationLogs(), getSettings()]);
  const tz = settings.timezone;
  const active = gateways.filter((g) => g.status === "active");
  return (
    <>
      <PageHeader title="Integrações" description="Gateways de pagamento e serviços externos. Os segredos ficam apenas no servidor e nunca são apresentados." />
      <Alert tone={active.length ? "success" : "warning"} className="mb-6" title={active.length ? `Pagamentos ativos: ${active.map((g) => g.name).join(" e ")}` : "Nenhum gateway de pagamento ativo"}>
        {active.length
          ? "O checkout mostra os métodos dos gateways ativos. Cada pagamento vai apenas para o gateway escolhido e só fica pago após confirmação válida desse gateway."
          : "O checkout informa o comprador de que não existem métodos de pagamento disponíveis. Nada é cobrado."}
      </Alert>

      <section aria-labelledby="gateways-title">
        <h2 id="gateways-title" className="mb-1 font-display text-lg font-semibold">Gateways de Pagamento</h2>
        <p className="mb-4 text-sm text-muted">Ative ou desative cada gateway de forma independente. Desativar não apaga credenciais nem histórico.</p>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {gateways.map((g) => (
            <GatewayCard key={g.id} g={g} tz={tz} />
          ))}
        </div>
      </section>

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
