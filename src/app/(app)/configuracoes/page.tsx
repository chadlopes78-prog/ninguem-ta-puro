import type { Metadata } from "next";
import { requireUser } from "@/server/auth/session";
import { demoToolsEnabled, getSettings } from "@/server/services/settings";
import { demoDataCounts } from "@/server/services/demo";
import { salesHistoryCounts } from "@/server/services/sales-history";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionButton } from "@/components/ui/action-button";
import { SecurityCard, SettingsForm } from "@/components/settings/settings-form";
import { changePasswordAction, clearDemoAction, clearSalesHistoryAction, saveSettingsAction, seedDemoAction, setDemoModeAction } from "./actions";
import { PushSettings } from "@/components/notifications/push-settings";
import { getVapidKeys } from "@/server/notifications/push";
import { getPrefs, listDevices } from "@/server/notifications/service";
import { revokeDeviceAction, savePrefsAction, sendTestAction } from "../(operacoes)/notificacoes/actions";

export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [s, counts, vapid, devices, prefs, history] = await Promise.all([getSettings(user.id), demoDataCounts(user.id), getVapidKeys().catch(() => null), listDevices(user.id), getPrefs(user.id), salesHistoryCounts(user.id)]);
  const tools = demoToolsEnabled();
  const hasDemo = Object.values(counts).some((n) => n > 0);

  return (
    <>
      <PageHeader title="Configurações" description="A sua conta, preferências e segurança." />
      <div className="grid gap-5">
        <SettingsForm action={saveSettingsAction} initial={{ email: user.email, name: user.name, defaultCurrency: s.defaultCurrency, locale: s.locale, timezone: s.timezone }} />

        <SecurityCard changeAction={changePasswordAction} />

        <Card id="notificacoes" className="scroll-mt-6">
          <CardHeader title="Notificações e Alertas" description="Alertas de vendas, pagamentos e reembolsos no painel e por notificação push (Android, iPhone e computador)." />
          <CardBody>
            <PushSettings
              publicKey={vapid?.publicKey ?? null}
              devices={devices.map((d) => ({
                ...d,
                createdAt: d.createdAt.toISOString(),
                lastSuccessAt: d.lastSuccessAt?.toISOString() ?? null,
                lastErrorAt: d.lastErrorAt?.toISOString() ?? null,
                revokedAt: d.revokedAt?.toISOString() ?? null,
              }))}
              prefs={prefs}
              savePrefs={savePrefsAction}
              revokeDevice={revokeDeviceAction}
              sendTest={sendTestAction}
            />
          </CardBody>
        </Card>

        <Card id="historico" className="scroll-mt-6" data-testid="sales-history-card">
          <CardHeader
            title="Limpar histórico de vendas"
            description="Fez compras de teste com o seu próprio número? Elimine-as para que o Dashboard, Operações e Relatórios mostrem só vendas verdadeiras. Produtos, checkouts, funis e integrações não são afetados."
          />
          <CardBody className="grid gap-4">
            <p className="text-sm text-muted" data-testid="sales-history-counts">
              Histórico atual: {history.orders} pedido(s), dos quais {history.testOrders} pagamento(s) de teste.
            </p>
            <div className="flex flex-wrap gap-2">
              <ActionButton
                variant="secondary"
                action={clearSalesHistoryAction.bind(null, "test")}
                disabled={!history.testOrders}
                data-testid="clear-test-sales"
                confirm={{ title: "Limpar pagamentos de teste?", description: `${history.testOrders} pedido(s) pagos em modo de teste serão eliminados permanentemente. As vendas reais ficam intactas.`, confirmLabel: "Limpar testes", danger: true }}
              >
                Limpar pagamentos de teste
              </ActionButton>
              <ActionButton
                variant="danger"
                action={clearSalesHistoryAction.bind(null, "all")}
                disabled={!history.orders}
                data-testid="clear-all-sales"
                confirm={{
                  title: "Limpar TODO o histórico de vendas?",
                  description: `Os ${history.orders} pedido(s) desta conta (incluindo vendas reais), os pagamentos, entregas, reembolsos, notificações de vendas, visitas dos checkouts e metas celebradas serão eliminados permanentemente. O Dashboard recomeça do zero. Não pode ser desfeito. Para apagar só uma compra, abra o pedido em Operações e use «Eliminar pedido».`,
                  confirmLabel: "Limpar tudo",
                  danger: true,
                }}
              >
                Limpar todo o histórico
              </ActionButton>
            </div>
          </CardBody>
        </Card>

        <Card id="demo" className="scroll-mt-6">
          <CardHeader
            title="Modo de demonstração"
            description="Dados fictícios isolados para testar a plataforma. Nunca são misturados com dados reais nem entram nos relatórios reais."
            action={s.demoMode ? <Badge tone="demo">Ativo</Badge> : <Badge>Inativo</Badge>}
          />
          <CardBody className="grid gap-4">
            <p className="text-sm text-muted">
              Dados de demonstração existentes: {counts.products} produtos · {counts.checkouts} checkouts · {counts.funnels} funis · {counts.orders} pedidos · {counts.customers} clientes · {counts.coupons} cupões.
            </p>
            {!tools && (
              <Alert tone="info">A geração de dados de demonstração está desativada neste ambiente (DEMO_TOOLS_ENABLED ≠ true). Pode continuar a ativar o modo e a limpar dados existentes.</Alert>
            )}
            <div className="flex flex-wrap gap-2">
              <ActionButton variant={s.demoMode ? "secondary" : "primary"} action={setDemoModeAction.bind(null, !s.demoMode)}>
                {s.demoMode ? "Desativar modo de demonstração" : "Ativar modo de demonstração"}
              </ActionButton>
              {tools && (
                <ActionButton
                  variant="secondary"
                  action={seedDemoAction}
                  confirm={{ title: "Gerar dados de demonstração", description: "Os dados de demonstração existentes serão substituídos por um conjunto novo (produtos, checkouts, funil com upsell/downsell, cupões e 48 pedidos fictícios). Os dados reais não são afetados." }}
                >
                  Gerar dados de demonstração
                </ActionButton>
              )}
              {hasDemo && (
                <ActionButton
                  variant="danger"
                  action={clearDemoAction}
                  confirm={{ title: "Remover dados de demonstração", description: "Todos os registos de demonstração serão eliminados permanentemente. Os dados reais não são afetados.", confirmLabel: "Remover", danger: true }}
                >
                  Remover dados de demonstração
                </ActionButton>
              )}
            </div>
          </CardBody>
        </Card>

      </div>
    </>
  );
}
