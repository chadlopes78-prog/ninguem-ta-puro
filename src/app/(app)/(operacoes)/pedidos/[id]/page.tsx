import { displayEmail } from "@/lib/buyer-email";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getOrder } from "@/server/services/orders";
import { NotFoundError } from "@/server/services/products";
import { canTransition, ORDER_STATUS_LABELS } from "@/server/services/order-logic";
import type { PaymentStatus } from "@prisma/client";
import type { Tone } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionButton } from "@/components/ui/action-button";
import { OrderStatusBadge } from "@/components/orders/status";
import { changeOrderStatusAction, deleteOrderAction, recordRefundAction, resolveUncertainPaymentAction } from "../actions";
import { RefundButton } from "@/components/orders/refund-panel";
import { needsManualVerification } from "@/server/services/payment-flow";
import { e2Reference } from "@/server/payments/providers/e2payments";

export const metadata: Metadata = { title: "Pedido" };

const PAYMENT_LABEL: Record<PaymentStatus, string> = { CREATED: "Criado", PENDING: "Pendente", PAID: "Pago", FAILED: "Falhou", CANCELED: "Cancelado", EXPIRED: "Expirado" };
const PAYMENT_TONE: Record<PaymentStatus, Tone> = { CREATED: "neutral", PENDING: "warning", PAID: "success", FAILED: "danger", CANCELED: "neutral", EXPIRED: "neutral" };

const GATEWAY_NAMES: Record<string, string> = { epay: "EPay", e2payments: "E2Payments", pagar: "Pagar", "teste-local": "Fornecedor de teste" };

const KIND = { MAIN: "Principal", ORDER_BUMP: "Oferta adicional", UPSELL: "Upsell", DOWNSELL: "Downsell" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-fg [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { isDemo, settings, scope } = await getScope();
  const o = await getOrder(id, scope).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const tz = settings.timezone;
  const manualIds = new Set<string>();
  if (!isDemo && o.status === "PENDING") for (const p of o.payments) if (await needsManualVerification(p, o.ownerId)) manualIds.add(p.id);
  const m = (c: number) => formatMoney(c, o.currency);
  const can = (to: "APPROVED" | "DECLINED" | "REFUNDED" | "CANCELED") => canTransition(o.status, to, { isDemo }).ok;
  const refundedCents = o.refunds.reduce((a, r) => a + r.amountCents, 0);
  const refundable = o.status === "APPROVED" && o.approvedAt !== null && refundedCents < o.totalCents;
  const remaining = o.totalCents - refundedCents;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Pedidos", href: "/pedidos" }, { label: o.code }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <span className="font-mono">{o.code}</span>
            <OrderStatusBadge status={o.status} />
            {isDemo && <DemoBadge />}
            {o.source === "MANUAL_TEST" && <Badge tone="info">Teste manual</Badge>}
            {o.isTestPayment && <Badge tone="warning">Pagamento de teste — não conta como receita</Badge>}
          </span>
        }
        description={`Criado em ${formatDate(o.createdAt, tz, true)} · atualizado em ${formatDate(o.updatedAt, tz, true)}`}
        actions={
          <>
            {can("APPROVED") && <ActionButton action={changeOrderStatusAction.bind(null, o.id, "APPROVED")} confirm={{ title: "Aprovar (simulação)", description: "Marca este pedido de demonstração como aprovado. Nenhum pagamento real é processado." }}>Aprovar (demo)</ActionButton>}
            {can("DECLINED") && <ActionButton variant="secondary" action={changeOrderStatusAction.bind(null, o.id, "DECLINED")}>Recusar (demo)</ActionButton>}
            {can("REFUNDED") && <ActionButton variant="secondary" action={changeOrderStatusAction.bind(null, o.id, "REFUNDED")} confirm={{ title: "Reembolsar (simulação)", description: "Marca o pedido de demonstração como reembolsado.", danger: true }}>Reembolsar (demo)</ActionButton>}
            {refundable && (
              <RefundButton
                remainingLabel={m(remaining)}
                remainingInput={(remaining / 100).toFixed(2).replace(".", ",")}
                isDemo={isDemo}
                gatewayName={GATEWAY_NAMES[o.provider ?? ""] ?? "plataforma de pagamentos"}
                action={recordRefundAction.bind(null, o.id)}
              />
            )}
            {can("CANCELED") && <ActionButton variant="danger" action={changeOrderStatusAction.bind(null, o.id, "CANCELED")} confirm={{ title: "Cancelar pedido", description: "O pedido pendente será cancelado. Esta ação não pode ser desfeita.", confirmLabel: "Cancelar pedido", danger: true }}>Cancelar pedido</ActionButton>}
            {!isDemo && (
              <ActionButton
                variant="danger"
                action={deleteOrderAction.bind(null, o.id)}
                redirectTo="/pedidos"
                data-testid="delete-order"
                confirm={{
                  title: "Eliminar este pedido?",
                  description: "O pedido, os pagamentos, a entrega e os upsells associados são eliminados permanentemente e deixam de contar no Dashboard, em Operações e nos Relatórios. Use para compras de teste. Não pode ser desfeito.",
                  confirmLabel: "Eliminar pedido",
                  danger: true,
                }}
              >
                Eliminar pedido
              </ActionButton>
            )}
          </>
        }
      />
      {!isDemo && o.status === "PENDING" && (
        <Alert tone="info" className="mb-5">
          A encomenda só passa a paga com confirmação oficial do processador (notificação autenticada ou consulta de estado). Regressar à página de sucesso não conta como pagamento.
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2 lg:self-start">
          <CardHeader title="Itens" />
          <ul className="divide-y divide-line">
            {o.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <Link href={`/produtos/${i.product.id}`} className="font-medium text-fg hover:text-accent">{i.product.name}</Link>
                  <p className="text-[12.5px] text-subtle">{i.offer?.name ?? i.description} · {KIND[i.kind]} · {i.quantity}×</p>
                </div>
                <span className="font-medium tabular">{m(i.totalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="divide-y divide-line/60 border-t border-line px-5 py-2">
            <Row label="Subtotal">{m(o.subtotalCents)}</Row>
            <Row label={`Desconto${o.coupon ? ` (${o.coupon.code})` : ""}`}>−{m(o.discountCents)}</Row>
            <Row label="Valor bruto"><span className="font-semibold">{m(o.totalCents)}</span></Row>
            <Row label="Taxas registadas">{m(o.feeCents)}</Row>
            <Row label="Valor líquido"><span className="font-semibold">{m(o.netCents)}</span></Row>
            {refundedCents > 0 && <Row label="Reembolsado"><span className="font-semibold text-info" data-testid="refunded-total">−{m(refundedCents)}</span></Row>}
          </dl>
          {o.refunds.length > 0 && (
            <div className="border-t border-line px-5 py-3">
              <p className="text-[12px] font-medium uppercase tracking-wider text-subtle">Reembolsos</p>
              <ul className="mt-2 flex flex-col gap-1.5 text-[13px]" data-testid="refund-list">
                {o.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap justify-between gap-2">
                    <span className="text-muted">{formatDate(r.createdAt, tz, true)} · {r.reason ?? "Sem motivo"} · {r.actor}</span>
                    <span className="font-medium tabular">−{m(r.amountCents)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Cliente" />
            <CardBody>
              <Link href={`/clientes/${o.customer.id}`} className="font-medium text-fg hover:text-accent">{o.customer.name}</Link>
              <p className="text-sm text-muted">{displayEmail(o.customer.email)}</p>
              {o.customer.phone && <p className="text-sm text-muted">{o.customer.phone}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Detalhes" />
            <CardBody className="py-2">
              <dl className="divide-y divide-line/60">
                <Row label="Moeda">{o.currency}</Row>
                <Row label="Origem">{o.source === "CHECKOUT" ? "Checkout" : o.source === "MANUAL_TEST" ? "Teste manual" : "Demonstração"}</Row>
                <Row label="Checkout">{o.checkout ? <Link href={`/checkouts/${o.checkout.id}`} className="hover:text-accent">{o.checkout.name}</Link> : "—"}</Row>
                <Row label="Funil">{o.funnel ? <Link href={`/funis/${o.funnel.id}`} className="hover:text-accent">{o.funnel.name}</Link> : "—"}</Row>
                <Row label="Processador">{o.provider ?? "—"}</Row>
                <Row label="Referência externa"><span className="break-all font-mono text-[12px]">{o.externalRef ?? "—"}</span></Row>
                <Row label="Aprovado em">{o.approvedAt ? formatDate(o.approvedAt, tz, true) : "—"}</Row>
                {o.refundedAt && <Row label="Reembolsado em">{formatDate(o.refundedAt, tz, true)}</Row>}
                {o.canceledAt && <Row label="Cancelado em">{formatDate(o.canceledAt, tz, true)}</Row>}
              </dl>
              {o.notes && <p className="mt-3 rounded-[var(--radius-md)] bg-surface-2 p-3 text-[12.5px] text-muted">{o.notes}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Pagamentos" description="Tentativas junto do processador" />
            <CardBody>
              {o.payments.length === 0 ? (
                <p className="text-sm text-subtle">Sem tentativas de pagamento.</p>
              ) : (
                <ul className="flex flex-col gap-3 text-[13px]" data-testid="payments-list">
                  {o.payments.map((p) => (
                    <li key={p.id} className="rounded-[var(--radius-md)] border border-line p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{GATEWAY_NAMES[p.provider] ?? p.provider} · {p.method ?? "—"}</span>
                        <Badge tone={PAYMENT_TONE[p.status]}>{PAYMENT_LABEL[p.status]}</Badge>
                      </div>
                      <p className="mt-1 text-muted tabular">{m(p.amountCents)}{p.phoneMasked ? ` · ${p.phoneMasked}` : ""}</p>
                      <p className="mt-0.5 break-all font-mono text-[11.5px] text-subtle">{p.externalId ?? "sem referência externa"}</p>
                      {p.environment && <p className="text-[11.5px] text-subtle">Ambiente: {p.environment === "test" ? "teste (sandbox)" : "produção"}</p>}
                      {p.environment === "test" && p.status !== "PAID" && (
                        <p className="mt-1 text-[11.5px] text-warning" data-testid="payment-test-env">
                          Credenciais de TESTE: o gateway não envia o pedido (USSD) para números reais — só simula com os números de teste do fornecedor. Para cobrar clientes, active o modo real em Integrações.
                        </p>
                      )}
                      {p.failureReason && <p className="mt-1 text-[12px] text-warning" data-testid="payment-justification">{p.failureReason}</p>}
                      {p.gatewayMessage && !p.failureReason?.includes(p.gatewayMessage) && <p className="mt-0.5 break-words text-[11.5px] text-subtle">Resposta do gateway: {p.gatewayMessage}</p>}
                      <p className="mt-1 text-[11.5px] text-subtle">Criado {formatDate(p.createdAt, tz, true)}{p.confirmedAt ? ` · confirmado ${formatDate(p.confirmedAt, tz, true)}` : ""}</p>
                      {manualIds.has(p.id) && (
                        <div className="mt-3 rounded-[var(--radius-md)] border border-warning/30 bg-warning/[0.06] p-3" data-testid="manual-verification">
                          <p className="text-[12.5px] text-warning">
                            Sem resposta da {GATEWAY_NAMES[p.provider] ?? p.provider}: o comprador pode ter confirmado no telemóvel. Verifique a transação no painel do fornecedor (referência {e2Reference(o.code)}) e indique o resultado.
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <ActionButton size="sm" action={resolveUncertainPaymentAction.bind(null, o.id, "paid")} confirm={{ title: "Confirmar pagamento", description: "Confirme apenas se viu a transação concluída no painel do fornecedor. O acesso ao produto será libertado.", confirmLabel: "Confirmar pago" }}>
                              Confirmar como pago
                            </ActionButton>
                            <ActionButton size="sm" variant="secondary" action={resolveUncertainPaymentAction.bind(null, o.id, "failed")} confirm={{ title: "Marcar como não pago", description: "A encomenda fica recusada e nada é entregue.", confirmLabel: "Marcar não pago", danger: true }}>
                              Não foi pago
                            </ActionButton>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {o.paymentEvents.length > 0 && (
                <>
                  <p className="mt-4 text-[12px] font-medium uppercase tracking-wider text-subtle">Notificações recebidas</p>
                  <ul className="mt-2 flex flex-col gap-1.5 text-[13px]">
                    {o.paymentEvents.map((e) => (
                      <li key={e.id} className="flex justify-between gap-2">
                        <span>{e.type}</span>
                        <span className="text-muted">{e.status}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {o.delivery && (
                <p className="mt-4 text-[12.5px] text-muted">
                  Acesso ao produto {o.status === "APPROVED" ? "ativo" : "revogado"} · {o.delivery.accessCount} acesso(s)
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Registo de auditoria" />
            <CardBody>
              {o.auditLogs.length === 0 ? (
                <p className="text-sm text-subtle">Sem alterações registadas.</p>
              ) : (
                <ol className="flex flex-col gap-2.5 text-[13px]" data-testid="audit-log">
                  {o.auditLogs.map((a) => (
                    <li key={a.id}>
                      <p>
                        {a.fromStatus ? ORDER_STATUS_LABELS[a.fromStatus] : "—"} → <span className="font-medium">{ORDER_STATUS_LABELS[a.toStatus]}</span>
                      </p>
                      <p className="text-[12px] text-subtle">
                        {formatDate(a.createdAt, tz, true)} · {a.actor}
                        {a.reason ? ` · ${a.reason}` : ""}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
