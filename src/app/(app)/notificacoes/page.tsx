import type { Metadata } from "next";
import Link from "next/link";
import { Bell, BellRing, CircleAlert, Clock, CreditCard, FlaskConical, History, RotateCcw, Settings2, TrendingUp, type LucideIcon } from "lucide-react";
import type { NotificationType } from "@prisma/client";
import { requireUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { eventHistory, listNotifications } from "@/server/notifications/service";
import { ORDER_STATUS_LABELS } from "@/server/services/order-logic";
import { TYPE_LABELS } from "@/lib/notifications";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge, DemoBadge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { ActionButton } from "@/components/ui/action-button";
import { LinkButton } from "@/components/ui/button";
import { NotificationActions } from "@/components/notifications/notification-item";
import { markAllReadAction, markReadAction } from "./actions";

export const metadata: Metadata = { title: "Notificações" };

const TYPE_ICON: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  SALE_CONFIRMED: { icon: TrendingUp, tone: "text-success bg-success/10" },
  PAYMENT_PENDING: { icon: Clock, tone: "text-warning bg-warning/10" },
  PAYMENT_FAILED: { icon: CircleAlert, tone: "text-danger bg-danger/10" },
  REFUND_CONFIRMED: { icon: RotateCcw, tone: "text-info bg-info/10" },
  DAILY_SUMMARY: { icon: CreditCard, tone: "text-accent bg-accent/10" },
  TEST: { icon: FlaskConical, tone: "text-muted bg-surface-3" },
};

const PUSH_LABEL: Record<string, { label: string; tone: Tone } | null> = {
  none: null,
  received: { label: "Push recebido no dispositivo", tone: "success" },
  sent: { label: "Push aceite pelo serviço", tone: "info" },
  pending: { label: "Push na fila", tone: "warning" },
  failed: { label: "Push falhou — disponível aqui", tone: "danger" },
};

const TYPES = Object.keys(TYPE_LABELS) as NotificationType[];

function when(d: Date) {
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const { isDemo, settings, scope } = await getScope();
  const tab = sp.tab === "historico" ? "historico" : sp.tab === "nao-lidas" ? "nao-lidas" : "todas";
  const type = TYPES.includes(sp.tipo as NotificationType) ? (sp.tipo as NotificationType) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const list = tab === "historico" ? null : await listNotifications(user.id, { unreadOnly: tab === "nao-lidas", type, page });
  const history = tab === "historico" ? await eventHistory(scope, 50) : null;
  const href = (p: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries({ tab: tab === "todas" ? undefined : tab, tipo: type, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/notificacoes${q.size ? `?${q}` : ""}`;
  };
  const tz = settings.timezone;

  return (
    <>
      <PageHeader
        title={<span className="flex flex-wrap items-center gap-3">Notificações {isDemo && <DemoBadge />}</span>}
        description="Alertas de vendas confirmadas, pagamentos e reembolsos. Ficam guardados aqui mesmo que o push não chegue ao dispositivo."
        actions={
          <>
            <LinkButton href="/configuracoes#notificacoes" variant="ghost" size="sm">
              <Settings2 className="h-4 w-4" /> Preferências e dispositivos
            </LinkButton>
            {list && list.unread > 0 && (
              <ActionButton variant="secondary" size="sm" action={markAllReadAction} data-testid="mark-all-read">
                Marcar todas como lidas
              </ActionButton>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav className="inline-flex rounded-[var(--radius-md)] border border-line bg-surface p-1" aria-label="Vistas">
          {[
            { key: "todas", label: "Todas" },
            { key: "nao-lidas", label: `Não lidas${list ? ` (${list.unread})` : ""}` },
            { key: "historico", label: "Histórico de eventos" },
          ].map((t) => (
            <Link
              key={t.key}
              href={`/notificacoes${t.key === "todas" ? "" : `?tab=${t.key}`}`}
              aria-current={tab === t.key ? "page" : undefined}
              className={cn("h-8 rounded-[7px] px-3 text-[13px] font-medium leading-8", tab === t.key ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        {tab !== "historico" && (
          <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por tipo">
            <Link href={href({ tipo: undefined, page: undefined })} className={cn("rounded-full border px-3 py-1 text-[12px]", !type ? "border-accent text-fg" : "border-line text-muted hover:text-fg")}>
              Todos os tipos
            </Link>
            {TYPES.filter((t) => t !== "TEST").map((t) => (
              <Link key={t} href={href({ tipo: t, page: undefined })} className={cn("rounded-full border px-3 py-1 text-[12px]", type === t ? "border-accent text-fg" : "border-line text-muted hover:text-fg")}>
                {TYPE_LABELS[t]}
              </Link>
            ))}
          </div>
        )}
      </div>

      {list && (
        <Card>
          {list.rows.length === 0 ? (
            <EmptyState
              icon={tab === "nao-lidas" ? BellRing : Bell}
              title={tab === "nao-lidas" ? "Está tudo lido" : "Ainda sem notificações"}
              description="Quando um pagamento for confirmado, pendente, falhar ou for reembolsado, o alerta aparece aqui. Ative o push em Preferências para o receber no telemóvel."
              action={<LinkButton href="/configuracoes#notificacoes" variant="secondary" size="sm">Configurar notificações</LinkButton>}
            />
          ) : (
            <ul className="divide-y divide-line" data-testid="notification-list">
              {list.rows.map((n) => {
                const meta = TYPE_ICON[n.type];
                const push = PUSH_LABEL[n.push];
                const unread = !n.readAt;
                return (
                  <li key={n.id} className={cn("flex flex-wrap items-start gap-3 px-4 py-4 sm:flex-nowrap sm:px-5", unread && "bg-accent/[0.035]")} data-testid="notification" data-unread={unread ? "true" : "false"} data-type={n.type}>
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", meta.tone)}>
                      <meta.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
                        {unread && <span className="h-2 w-2 rounded-full bg-accent" aria-label="Não lida" />}
                        {n.title}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-muted">{n.body}</p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11.5px] text-subtle">
                        <span>{when(n.createdAt)}</span>
                        <span>· {TYPE_LABELS[n.type]}</span>
                        {push && <Badge tone={push.tone}>{push.label}</Badge>}
                      </p>
                    </div>
                    <NotificationActions id={n.id} url={n.url} unread={unread} markRead={markReadAction} />
                  </li>
                );
              })}
            </ul>
          )}
          <Pagination page={list.page} pages={list.pages} total={list.total} makeHref={(p) => href({ page: String(p) })} />
        </Card>
      )}

      {history && (
        <Card>
          {history.length === 0 ? (
            <EmptyState icon={History} title="Sem eventos" description="As alterações de estado dos pedidos (pagamentos confirmados, falhados, cancelados, reembolsos) aparecem aqui." />
          ) : (
            <ul className="divide-y divide-line" data-testid="event-history">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13px]">
                  <span className="w-32 shrink-0 tabular text-subtle">{h.createdAt.toLocaleString("pt-PT", { timeZone: tz, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                  <Link href={`/pedidos/${h.order.id}`} className="font-medium text-fg hover:text-accent">
                    {h.order.code}
                  </Link>
                  <span className="text-muted">
                    {h.fromStatus ? `${ORDER_STATUS_LABELS[h.fromStatus]} → ` : ""}
                    {ORDER_STATUS_LABELS[h.toStatus]}
                  </span>
                  <span className="tabular text-muted">{formatMoney(h.order.totalCents, h.order.currency as CurrencyCode)}</span>
                  <span className="min-w-0 flex-1 truncate text-subtle">{h.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </>
  );
}
