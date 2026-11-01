import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getSettings } from "@/server/services/settings";
import { isGatewayId, listGateways, type GatewayView } from "@/server/services/integrations";
import { listMetaPixels, listMetaProductOptions } from "@/server/services/meta-capi";
import { secretStorageAvailable } from "@/server/secret-box";
import { scopeOf } from "@/server/scope";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/ui/action-button";
import { E2PaymentsForm } from "@/components/integrations/e2payments-form";
import { EPayForm } from "@/components/integrations/epay-form";
import { PagarForm } from "@/components/integrations/pagar-form";
import { resolveAppBaseUrl } from "@/server/app-url";
import { CopyButton } from "@/components/ui/copy-button";
import { MetaPixelForm } from "@/components/integrations/meta-pixel-form";
import { PagarDomainForm } from "@/components/integrations/pagar-domain-form";
import { getPagarDomain, type PagarDomainView } from "@/server/services/pagar-domain";
import { Checks, Details, Info, IntegrationLogo, KeySetup, STATUS_TONE } from "../integration-parts";
import {
  checkIntegrationAction,
  deleteMetaPixelAction,
  reconcileAction,
  saveE2CredentialsAction,
  saveEPayCredentialsAction,
  savePagarCredentialsAction,
  savePagarDomainAction,
  setPagarModeAction,
  saveMetaPixelAction,
  setGatewayEnabledAction,
  setMetaEnabledAction,
  testGatewayConnectionAction,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurar integração" };

const crumbs = (name: string) => [{ label: "Integrações", href: "/integracoes" }, { label: name }];

function GatewayConfig({ g, tz, webhookUrl, domain }: { g: GatewayView; tz: string; webhookUrl: string | null; domain: PagarDomainView | null }) {
  const ready = g.configured && g.status !== "config_error";
  return (
    <>
      <PageHeader
        breadcrumbs={crumbs(g.name)}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <IntegrationLogo id={g.id} className="h-10 w-14" />
            {g.name}
          </span>
        }
        description={g.description}
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]" data-testid={`gateway-${g.id}`}>
        <Card className="min-w-0">
          <CardHeader title="Credenciais" description={g.id === "epay" ? "Chave secreta da sua conta EPay." : g.id === "pagar" ? "API key, signing secret e webhook secret da sua app na Pagar." : "Dados da sua conta E2Payments."} />
          <CardBody className="flex flex-col gap-4">
            {g.id === "pagar" ? (
              <>
                {g.pagar && (
                  <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-line p-3" data-testid="pagar-mode" data-mode={g.pagar.mode}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13px] font-medium text-fg">Modo de processamento</p>
                      <Badge tone={g.pagar.mode === "live" ? "success" : "warning"} dot>
                        {g.pagar.mode === "live" ? "Real (dinheiro real)" : "Teste (simulado)"}
                      </Badge>
                    </div>
                    <p className="text-[12.5px] text-muted">
                      {g.pagar.mode === "live"
                        ? "Os novos pagamentos cobram dinheiro real aos compradores."
                        : "Os pagamentos são simulados: use os números de teste da Pagar (M-Pesa 840000001, e-Mola 860000001 = sucesso). Para cobrar de verdade, guarde as credenciais de produção e ative o modo real."}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {g.pagar.mode === "live" ? (
                        <ActionButton
                          size="sm"
                          variant="secondary"
                          action={setPagarModeAction.bind(null, "test", false)}
                          disabled={!g.pagar.sets.test.apiKeyMasked}
                          data-testid="pagar-mode-test"
                          confirm={{ title: "Voltar ao modo de teste", description: "Os novos pagamentos passam a ser simulados. Pagamentos já iniciados não são alterados.", confirmLabel: "Usar modo de teste" }}
                        >
                          Usar modo de teste
                        </ActionButton>
                      ) : (
                        <ActionButton
                          size="sm"
                          action={setPagarModeAction.bind(null, "live", true)}
                          disabled={!g.pagar.sets.live.apiKeyMasked}
                          data-testid="pagar-mode-live"
                          confirm={{
                            title: "Ativar o modo real",
                            description: "A partir de agora, os novos pagamentos da Pagar cobram dinheiro real aos compradores. A Pagar verifica primeiro as credenciais de produção; a sua app tem de estar aprovada para LIVE na Pagar.",
                            confirmLabel: "Ativar modo real",
                          }}
                        >
                          Ativar modo real
                        </ActionButton>
                      )}
                    </div>
                  </div>
                )}
                {g.pagar?.storageAvailable ? (
                  <>
                    <Details title={`Credenciais de teste${g.pagar.mode === "test" ? " (em uso)" : ""}`} testId="pagar-creds-test" open={g.pagar.mode === "test"}>
                      <PagarForm key={`t-${g.pagar.sets.test.apiKeyMasked}-${g.pagar.sets.test.hasSigningSecret}-${g.pagar.sets.test.hasWebhookSecret}`} action={savePagarCredentialsAction} initial={g.pagar.sets.test} mode="test" />
                    </Details>
                    <Details title={`Credenciais de produção — modo real${g.pagar.mode === "live" ? " (em uso)" : ""}`} testId="pagar-creds-live" open={g.pagar.mode === "live"}>
                      <PagarForm key={`l-${g.pagar.sets.live.apiKeyMasked}-${g.pagar.sets.live.hasSigningSecret}-${g.pagar.sets.live.hasWebhookSecret}`} action={savePagarCredentialsAction} initial={g.pagar.sets.live} mode="live" />
                    </Details>
                  </>
                ) : g.pagar?.fromEnv ? (
                  <p className="text-[13px] text-muted">
                    Credenciais definidas nas variáveis do servidor (<code className="text-fg">PAGAR_*</code>; produção em <code className="text-fg">PAGAR_LIVE_*</code>) e nunca mostradas.
                  </p>
                ) : (
                  <KeySetup />
                )}
                {webhookUrl && (
                  <div className="rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-[12.5px]" data-testid="pagar-webhook-url">
                    <p className="font-medium text-fg">Endereço do webhook (adicione-o na sua app da Pagar)</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate text-muted">{webhookUrl}</code>
                      <CopyButton value={webhookUrl} label="Copiar" />
                    </div>
                  </div>
                )}
                {domain && (
                  <Details title="Verificação do domínio na Pagar (modo real)" testId="pagar-domain" open={Boolean(domain.host)}>
                    <div className="flex flex-col gap-3 text-[12.5px] text-muted">
                      <p>
                        Para passar para LIVE, a Pagar pede um token publicado no endereço da sua app. Cada endereço só pode mostrar um token: o endereço principal
                        {domain.platformHost ? <> (<code className="text-fg">{domain.platformHost}</code>)</> : null} pertence à conta da plataforma. Se tem a sua própria app na Pagar, use um endereço próprio
                        associado a esta plataforma (peça-o ao administrador) ou o seu domínio com registo DNS TXT.
                      </p>
                      <PagarDomainForm key={`${domain.host}-${domain.token}`} action={savePagarDomainAction} initial={{ host: domain.host, token: domain.token }} />
                      {domain.host && (
                        <div className="flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3" data-testid="pagar-domain-urls">
                          <p className="font-medium text-fg">Ficheiro de verificação</p>
                          <div className="flex items-center gap-2">
                            <code className="min-w-0 flex-1 truncate">{`https://${domain.host}/.well-known/pagar-verification.txt`}</code>
                            <CopyButton value={`https://${domain.host}/.well-known/pagar-verification.txt`} label="Copiar" />
                          </div>
                          <p className="font-medium text-fg">Webhook nesta app</p>
                          <div className="flex items-center gap-2">
                            <code className="min-w-0 flex-1 truncate">{`https://${domain.host}/api/webhooks/pagar`}</code>
                            <CopyButton value={`https://${domain.host}/api/webhooks/pagar`} label="Copiar" />
                          </div>
                        </div>
                      )}
                    </div>
                  </Details>
                )}
              </>
            ) : g.id === "epay" ? (
              g.epay?.fromEnv ? (
                <p className="text-[13px] text-muted">
                  Chave definida no servidor (<code className="text-fg">EPAY_SECRET_KEY</code>) e nunca mostrada. Para a alterar, edite a variável no alojamento.
                </p>
              ) : g.epay?.storageAvailable ? (
                <EPayForm key={g.epay.keyMasked ?? "none"} action={saveEPayCredentialsAction} initial={{ keyMasked: g.epay.keyMasked, keyEnvironment: g.epay.keyEnvironment }} />
              ) : (
                <KeySetup />
              )
            ) : g.e2?.fromEnv ? (
              <p className="text-[13px] text-muted">
                Credenciais definidas nas variáveis de ambiente do servidor (<code className="text-fg">E2PAYMENTS_*</code>). Para as alterar, edite-as no alojamento.
              </p>
            ) : g.e2?.storageAvailable ? (
              <E2PaymentsForm key={`${g.e2.clientIdMasked}-${g.e2.mpesaWalletId}-${g.e2.emolaWalletId}`} action={saveE2CredentialsAction} initial={g.e2} />
            ) : (
              <KeySetup />
            )}
            {g.lastError && g.status === "config_error" && (
              <p className="rounded-[var(--radius-md)] border border-danger/30 bg-danger/[0.06] p-2.5 text-[12.5px] text-danger" role="alert">
                {g.lastError}
              </p>
            )}
            {g.environment === "test" && g.configured && (
              <p className="rounded-[var(--radius-md)] border border-warning/30 bg-warning/[0.06] p-2.5 text-[12.5px] text-warning">Ambiente de teste: os pagamentos são simulados e não contam como receita.</p>
            )}
          </CardBody>
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader
              title="Estado"
              action={
                <Badge tone={STATUS_TONE[g.status]} dot>
                  <span data-testid="gateway-status" data-status={g.status}>
                    {g.statusLabel}
                  </span>
                </Badge>
              }
            />
            <CardBody className="flex flex-col gap-3">
              <div className="divide-y divide-line">
                <Info label="Novos pagamentos">{g.enabled ? (g.status === "active" ? "Ativado" : "Ativado, mas indisponível") : "Desativado"}</Info>
                <Info label="Credenciais">{g.configured ? "Configuradas" : "Por configurar"}</Info>
                {g.configured && <Info label="Ambiente">{g.environment === "test" ? "Teste" : "Produção"}</Info>}
                <Info label="Métodos">{g.methods.length ? g.methods.join(", ") : g.id === "epay" ? "M-Pesa, e-Mola, IZI" : "—"}</Info>
                {g.supportsConnectionTest && <Info label="Ligação">{g.verifiedAt ? `Verificada ${formatDate(g.verifiedAt, tz, true)}` : "Não verificada"}</Info>}
              </div>
              <div className="flex flex-wrap gap-2">
                {g.enabled ? (
                  <ActionButton
                    size="sm"
                    variant="secondary"
                    action={setGatewayEnabledAction.bind(null, g.id, false)}
                    confirm={{ title: `Desativar ${g.name}`, description: "Deixa de aceitar novos pagamentos. Credenciais e histórico ficam guardados; pagamentos já iniciados continuam a ser confirmados.", confirmLabel: "Desativar" }}
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
                    Verificar pendentes
                  </ActionButton>
                )}
              </div>
            </CardBody>
          </Card>

          <Details title="Detalhes técnicos" testId="gateway-technical">
            <Checks g={g} />
            {g.e2?.apiHost && g.verifiedAt && <p className="mt-3">Servidor: {g.e2.apiHost}</p>}
            <p className="mt-3 text-subtle">Última verificação: {g.lastCheckedAt ? formatDate(g.lastCheckedAt, tz, true) : "nunca"}</p>
          </Details>
          <Details title="Como funciona">
            {g.id === "epay" ? (
              <ol className="flex list-decimal flex-col gap-1.5 pl-5">
                <li>O comprador paga na página segura da EPay (valor calculado no servidor, em MZN).</li>
                <li>A EPay envia um aviso assinado para <code className="break-all text-fg">/api/webhooks/epay</code>.</li>
                <li>A encomenda só fica paga depois de a assinatura e o valor serem validados.</li>
              </ol>
            ) : (
              <ol className="flex list-decimal flex-col gap-1.5 pl-5">
                <li>O comprador escolhe M-Pesa ou e-Mola e confirma no telemóvel.</li>
                <li>A encomenda só fica paga quando a E2Payments confirma esse pedido autenticado.</li>
                <li>Sem resposta, o pagamento fica “por verificar” no pedido, para confirmar no painel da E2Payments.</li>
              </ol>
            )}
          </Details>
        </div>
      </div>
    </>
  );
}

async function MetaConfig({ userId, tz }: { userId: string; tz: string }) {
  const scope = scopeOf(userId, false); // pixels da conta real (vendas de demonstração nunca são enviadas)
  const pixels = await listMetaPixels(scope);
  const products = await listMetaProductOptions(scope, pixels.flatMap((p) => p.productIds));
  const active = pixels.some((p) => p.enabled && p.productIds.length > 0);
  const anyEnabled = pixels.some((p) => p.enabled);
  const name = new Set(products.map((p) => p.id));
  return (
    <>
      <PageHeader
        breadcrumbs={crumbs("Facebook Pixel")}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <IntegrationLogo id="meta" className="h-10 w-14" />
            Facebook Pixel / API de Conversões
          </span>
        }
        description="Envia o evento Purchase a partir do servidor, só para compras confirmadas dos produtos escolhidos."
        actions={
          pixels.length ? (
            anyEnabled ? (
              <ActionButton variant="secondary" action={setMetaEnabledAction.bind(null, false)} confirm={{ title: "Desativar o Pixel", description: "Nenhum evento é enviado enquanto estiver desativado. A configuração fica guardada.", confirmLabel: "Desativar" }}>
                Desativar
              </ActionButton>
            ) : (
              <ActionButton action={setMetaEnabledAction.bind(null, true)}>Ativar</ActionButton>
            )
          ) : undefined
        }
      />
      <div className="flex flex-col gap-5" data-testid="meta-integration">
        <p className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          Estado:
          <Badge tone={active ? "success" : "neutral"} dot>
            <span data-testid="meta-status" data-status={active ? "active" : "inactive"}>
              {active ? "Ativa" : "Inativa"}
            </span>
          </Badge>
        </p>
        {!secretStorageAvailable() ? (
          <KeySetup />
        ) : (
          <>
            {pixels.map((p) => (
              <Card key={p.id} data-testid={`meta-pixel-${p.pixelId}`}>
                <CardHeader
                  title={`Pixel ${p.pixelId}`}
                  description={`${p.enabled ? "Ativo" : "Desativado"} · ${p.productIds.length} produto(s) · Token ${p.tokenHint}`}
                  action={
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      action={deleteMetaPixelAction.bind(null, p.id)}
                      confirm={{ title: `Remover o Pixel ${p.pixelId}`, description: "O token é apagado e deixam de ser enviados eventos para este Pixel. Vendas e pedidos não mudam.", confirmLabel: "Remover", danger: true }}
                    >
                      Remover
                    </ActionButton>
                  }
                />
                <CardBody className="flex flex-col gap-4">
                  <div className="grid grid-cols-3 gap-2 text-center text-[12.5px] text-muted" data-testid="meta-stats">
                    <div className="rounded-[var(--radius-md)] bg-surface-2 p-2">
                      <span className="block text-base font-semibold tabular text-fg">{p.stats.sent}</span>enviadas
                    </div>
                    <div className="rounded-[var(--radius-md)] bg-surface-2 p-2">
                      <span className="block text-base font-semibold tabular text-fg">{p.stats.pending}</span>em fila
                    </div>
                    <div className="rounded-[var(--radius-md)] bg-surface-2 p-2">
                      <span className="block text-base font-semibold tabular text-fg">{p.stats.failed}</span>falhadas
                    </div>
                  </div>
                  <p className="text-[12px] text-subtle">Último envio: {p.lastSentAt ? formatDate(p.lastSentAt, tz, true) : "nenhum"}</p>
                  {p.lastError && (
                    <p className="rounded-[var(--radius-md)] border border-danger/30 bg-danger/[0.06] p-2.5 text-[12.5px] text-danger" role="alert" data-testid="meta-last-error">
                      {p.lastError}
                    </p>
                  )}
                  {p.productIds.some((id) => !name.has(id)) && <p className="text-[12px] text-subtle">Alguns produtos selecionados já não existem e são ignorados.</p>}
                  <details className="rounded-[var(--radius-md)] border border-line p-3 text-[13px]">
                    <summary className="flex min-h-9 cursor-pointer items-center font-medium text-fg" data-testid="meta-edit">
                      Editar Pixel, token e produtos
                    </summary>
                    <div className="mt-4">
                      <MetaPixelForm action={saveMetaPixelAction} products={products} initial={p} />
                    </div>
                  </details>
                </CardBody>
              </Card>
            ))}
            <Card>
              <CardHeader title={pixels.length ? "Adicionar outro Pixel" : "Configurar Pixel"} />
              <CardBody>
                <details className="text-[13px]" open={pixels.length === 0}>
                  <summary className="flex min-h-9 cursor-pointer items-center font-medium text-fg" data-testid="meta-add">
                    {pixels.length ? "Adicionar Pixel" : "Dados do Pixel"}
                  </summary>
                  <div className="mt-4">
                    <MetaPixelForm action={saveMetaPixelAction} products={products} />
                  </div>
                </details>
              </CardBody>
            </Card>
          </>
        )}
        <Details title="Como funciona">
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>O evento Purchase só é enviado depois de o pagamento ser confirmado pela EPay ou E2Payments.</li>
            <li>Cada compra tem um identificador único: novas tentativas nunca a contam duas vezes.</li>
            <li>Só os produtos selecionados enviam eventos; upsells e downsells pagos são compras próprias.</li>
            <li>O token fica cifrado no servidor. Email e telefone do comprador vão apenas com hash SHA-256.</li>
          </ul>
        </Details>
      </div>
    </>
  );
}

export default async function IntegrationConfigPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const settings = await getSettings(user.id);
  if (id === "meta") return <MetaConfig userId={user.id} tz={settings.timezone} />;
  if (!isGatewayId(id)) notFound();
  const g = (await listGateways(user.id)).find((x) => x.id === id);
  if (!g) notFound();
  const webhookUrl = id === "pagar" ? `${await resolveAppBaseUrl()}/api/webhooks/pagar` : null;
  const domain = id === "pagar" ? await getPagarDomain(user.id) : null;
  return <GatewayConfig g={g} tz={settings.timezone} webhookUrl={webhookUrl} domain={domain} />;
}
