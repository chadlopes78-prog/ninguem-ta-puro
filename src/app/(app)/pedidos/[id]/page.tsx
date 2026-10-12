import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { getOrder } from "@/server/services/orders";
import { NotFoundError } from "@/server/services/products";
import { canTransition } from "@/server/services/order-logic";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, DemoBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ActionButton } from "@/components/ui/action-button";
import { OrderStatusBadge } from "@/components/orders/status";
import { changeOrderStatusAction } from "../actions";

export const metadata: Metadata = { title: "Pedido" };

const KIND = { MAIN: "Principal", ORDER_BUMP: "Oferta adicional", UPSELL: "Upsell", DOWNSELL: "Downsell" } as const;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-fg">{children}</dd>
    </div>
  );
}

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  const { isDemo, settings } = await getScope();
  const o = await getOrder(id, isDemo).catch((e) => {
    if (e instanceof NotFoundError) notFound();
    throw e;
  });
  const tz = settings.timezone;
  const m = (c: number) => formatMoney(c, o.currency);
  const can = (to: "APPROVED" | "DECLINED" | "REFUNDED" | "CANCELED") => canTransition(o.status, to, { isDemo }).ok;

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
          </span>
        }
        description={`Criado em ${formatDate(o.createdAt, tz, true)} · atualizado em ${formatDate(o.updatedAt, tz, true)}`}
        actions={
          <>
            {can("APPROVED") && <ActionButton action={changeOrderStatusAction.bind(null, o.id, "APPROVED")} confirm={{ title: "Aprovar (simulação)", description: "Marca este pedido de demonstração como aprovado. Nenhum pagamento real é processado." }}>Aprovar (demo)</ActionButton>}
            {can("DECLINED") && <ActionButton variant="secondary" action={changeOrderStatusAction.bind(null, o.id, "DECLINED")}>Recusar (demo)</ActionButton>}
            {can("REFUNDED") && <ActionButton variant="secondary" action={changeOrderStatusAction.bind(null, o.id, "REFUNDED")} confirm={{ title: "Reembolsar (simulação)", description: "Marca o pedido de demonstração como reembolsado.", danger: true }}>Reembolsar (demo)</ActionButton>}
            {can("CANCELED") && <ActionButton variant="danger" action={changeOrderStatusAction.bind(null, o.id, "CANCELED")} confirm={{ title: "Cancelar pedido", description: "O pedido pendente será cancelado. Esta ação não pode ser desfeita.", confirmLabel: "Cancelar pedido", danger: true }}>Cancelar pedido</ActionButton>}
          </>
        }
      />
      {!isDemo && o.status === "PENDING" && (
        <Alert tone="info" className="mb-5">
          Aprovações e reembolsos só podem ocorrer através de eventos confirmados e assinados pelo processador de pagamentos (ainda não integrado).
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
          </dl>
        </Card>
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Cliente" />
            <CardBody>
              <Link href={`/clientes/${o.customer.id}`} className="font-medium text-fg hover:text-accent">{o.customer.name}</Link>
              <p className="text-sm text-muted">{o.customer.email}</p>
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
                <Row label="Referência externa"><span className="font-mono text-[12px]">{o.externalRef ?? "—"}</span></Row>
                <Row label="Aprovado em">{o.approvedAt ? formatDate(o.approvedAt, tz, true) : "—"}</Row>
                {o.refundedAt && <Row label="Reembolsado em">{formatDate(o.refundedAt, tz, true)}</Row>}
                {o.canceledAt && <Row label="Cancelado em">{formatDate(o.canceledAt, tz, true)}</Row>}
              </dl>
              {o.notes && <p className="mt-3 rounded-[var(--radius-md)] bg-surface-2 p-3 text-[12.5px] text-muted">{o.notes}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Eventos de pagamento" />
            <CardBody>
              {o.paymentEvents.length === 0 ? (
                <p className="text-sm text-subtle">Sem eventos do processador.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-sm">
                  {o.paymentEvents.map((e) => (
                    <li key={e.id} className="flex justify-between gap-2"><span>{e.type}</span><span className="text-muted">{e.status}</span></li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
