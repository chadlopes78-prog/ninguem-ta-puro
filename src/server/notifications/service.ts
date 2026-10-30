// Operações do utilizador sobre notificações, preferências e dispositivos subscritos.
// Todas as funções recebem o userId da sessão validada no servidor: ninguém vê ou altera dados de outra pessoa.
import "server-only";
import type { NotificationType, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { DEFAULT_PREFS, deviceLabelFromUserAgent, isAllowedPushEndpoint, type NotificationPrefs } from "@/lib/notifications";
import { addDays, startOfZonedDay, zonedDayKey } from "@/lib/dates";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { getVapidKeys, newReceiptToken, processPushOutbox, hasDuePushDeliveries, sendDelivery, type SendResult } from "./push";
import { notifyUsers } from "./events";
import { loadFinanceData } from "@/server/services/finance";
import { financeKpis, salesByProduct } from "@/server/services/finance-logic";
import { own, scopeOf, type Scope } from "@/server/scope";

// ───────────── Lista ─────────────

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; type?: NotificationType; page?: number; pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 20;
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.NotificationWhereInput = { userId, ...(opts.unreadOnly ? { readAt: null } : {}), ...(opts.type ? { type: opts.type } : {}) };
  const [rows, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { deliveries: { select: { status: true, receivedAt: true } } },
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return {
    rows: rows.map(({ deliveries, ...n }) => ({
      ...n,
      push: deliveries.length === 0 ? "none" : deliveries.some((d) => d.receivedAt) ? "received" : deliveries.some((d) => d.status === "SENT") ? "sent" : deliveries.some((d) => d.status === "PENDING") ? "pending" : "failed",
    })),
    total,
    unread,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export async function unreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function markRead(userId: string, id: string): Promise<boolean> {
  const r = await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  return r.count === 1;
}

export async function markAllRead(userId: string): Promise<number> {
  const r = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return r.count;
}

/** Histórico de eventos relevantes: alterações de estado dos pedidos (auditoria), mais recentes primeiro. */
export async function eventHistory(scope: Scope, take = 30) {
  return prisma.orderAuditLog.findMany({
    where: { order: own(scope) },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, fromStatus: true, toStatus: true, actor: true, reason: true, createdAt: true, order: { select: { id: true, code: true, totalCents: true, currency: true } } },
  });
}

// ───────────── Preferências ─────────────

export const prefsSchema = z.object({
  pushEnabled: z.boolean(),
  sales: z.boolean(),
  pending: z.boolean(),
  failed: z.boolean(),
  refunds: z.boolean(),
  dailySummary: z.boolean(),
  morning: z.boolean().default(true),
  evening: z.boolean().default(true),
  weeklySummary: z.boolean().default(true),
});

export async function getPrefs(userId: string): Promise<NotificationPrefs> {
  const p = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!p) return { ...DEFAULT_PREFS };
  return { pushEnabled: p.pushEnabled, sales: p.sales, pending: p.pending, failed: p.failed, refunds: p.refunds, dailySummary: p.dailySummary, morning: p.morning, evening: p.evening, weeklySummary: p.weeklySummary };
}

export async function savePrefs(userId: string, input: unknown): Promise<NotificationPrefs> {
  const data = prefsSchema.parse(input);
  await prisma.notificationPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return data;
}

// ───────────── Dispositivos ─────────────

const b64url = (min: number, max: number) => z.string().min(min).max(max).regex(/^[A-Za-z0-9_-]+=*$/);
export const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isAllowedPushEndpoint, "Serviço de push não reconhecido"),
  keys: z.object({ p256dh: b64url(80, 100), auth: b64url(16, 30) }),
});

export const MAX_DEVICES_PER_USER = 20;

/** Regista (ou atualiza) o dispositivo atual. Um endpoint pertence a um único utilizador. */
export async function subscribeDevice(userId: string, input: unknown, userAgent: string | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Subscrição inválida." };
  const keys = await getVapidKeys();
  if (!keys) return { ok: false, error: "O servidor ainda não tem chaves de notificação configuradas." };
  const { endpoint, keys: k } = parsed.data;
  const active = await prisma.pushSubscription.count({ where: { userId, revokedAt: null, endpoint: { not: endpoint } } });
  if (active >= MAX_DEVICES_PER_USER) return { ok: false, error: `Limite de ${MAX_DEVICES_PER_USER} dispositivos atingido. Remova um dispositivo antigo.` };
  const data = { userId, p256dh: k.p256dh, auth: k.auth, vapidKey: keys.publicKey, deviceLabel: deviceLabelFromUserAgent(userAgent), userAgent: userAgent?.slice(0, 300) ?? null, revokedAt: null, revokedReason: null, failureCount: 0, lastError: null };
  const sub = await prisma.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...data }, update: data });
  return { ok: true, id: sub.id };
}

/** Revoga um dispositivo do próprio utilizador (por id ou pelo endpoint do dispositivo atual). */
export async function revokeDevice(userId: string, by: { id?: string; endpoint?: string }, reason = "Removido pelo utilizador"): Promise<boolean> {
  if (!by.id && !by.endpoint) return false;
  const now = new Date();
  const r = await prisma.pushSubscription.updateMany({ where: { userId, revokedAt: null, ...(by.id ? { id: by.id } : { endpoint: by.endpoint }) }, data: { revokedAt: now, revokedReason: reason } });
  if (r.count) {
    await prisma.pushDelivery.updateMany({ where: { status: "PENDING", subscription: { userId, revokedAt: now } }, data: { status: "GONE", lastError: reason } });
  }
  return r.count > 0;
}

export async function listDevices(userId: string) {
  return prisma.pushSubscription.findMany({
    where: { userId },
    orderBy: [{ revokedAt: { sort: "asc", nulls: "first" } }, { createdAt: "desc" }],
    take: 30,
    select: { id: true, endpoint: true, deviceLabel: true, createdAt: true, lastSuccessAt: true, lastErrorAt: true, lastError: true, failureCount: true, revokedAt: true, revokedReason: true },
  });
}

// ───────────── Teste ─────────────

export type TestOutcome =
  | { kind: "accepted"; deliveryId: string; notificationId: string; statusCode: number }
  | { kind: "rejected"; notificationId: string; statusCode: number | null; error: string; revoked: boolean }
  | { kind: "no_device"; notificationId: string };

/**
 * Notificação de teste para o dispositivo atual. A notificação interna é sempre criada (canal "painel");
 * o resultado do push distingue "aceite pelo serviço de push" de "recebida no dispositivo" (confirmada depois
 * pelo service worker através de /api/push/receipt).
 */
export async function sendTestNotification(userId: string, endpoint: string | null): Promise<TestOutcome> {
  const sub = endpoint ? await prisma.pushSubscription.findFirst({ where: { userId, endpoint, revokedAt: null } }) : null;
  const n = await prisma.notification.create({
    data: {
      userId,
      type: "TEST",
      eventKey: `test:${newReceiptToken()}`,
      title: "👑 Notificação de teste",
      body: "Tudo pronto, Barão. Este dispositivo vai receber as tuas vendas aprovadas no momento.",
      url: "/notificacoes",
    },
  });
  if (!sub) return { kind: "no_device", notificationId: n.id };
  const d = await prisma.pushDelivery.create({ data: { notificationId: n.id, subscriptionId: sub.id, receiptToken: newReceiptToken() } });
  const r: SendResult | null = await sendDelivery(d.id);
  if (r?.ok) return { kind: "accepted", deliveryId: d.id, notificationId: n.id, statusCode: r.statusCode };
  const after = await prisma.pushSubscription.findUnique({ where: { id: sub.id }, select: { revokedAt: true } });
  return { kind: "rejected", notificationId: n.id, statusCode: r && !r.ok ? r.statusCode : null, error: r && !r.ok ? r.error : "Envio não efetuado", revoked: Boolean(after?.revokedAt) };
}

export async function deliveryStatus(userId: string, deliveryId: string) {
  const d = await prisma.pushDelivery.findFirst({ where: { id: deliveryId, subscription: { userId } }, select: { status: true, sentAt: true, receivedAt: true, lastStatusCode: true, lastError: true } });
  return d;
}

/** Confirmação de receção enviada pelo service worker do dispositivo (o token só existe no conteúdo cifrado). */
export async function confirmReceipt(deliveryId: string, token: string): Promise<boolean> {
  if (!/^[a-z0-9]{20,40}$/i.test(deliveryId) || !/^[A-Za-z0-9_-]{20,40}$/.test(token)) return false;
  const r = await prisma.pushDelivery.updateMany({ where: { id: deliveryId, receiptToken: token, receivedAt: null }, data: { receivedAt: new Date() } });
  return r.count === 1;
}

// ───────────── Resumo diário e tarefas de fundo ─────────────

const SUMMARY_HOUR = 7; // hora local a partir da qual o resumo do dia anterior pode ser enviado

function localHour(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/**
 * Resumo do dia anterior para UMA conta (no fuso das configurações dessa conta), uma única vez por dia: a tarefa é
 * reservada em JobRun na mesma transação que cria a notificação. Só usa os dados dessa conta.
 */
export async function runDailySummaryFor(ownerId: string, now = new Date(), opts: { force?: boolean } = {}): Promise<{ ran: boolean; day: string; created: number }> {
  const settings = await prisma.settings.findUnique({ where: { ownerId } });
  const tz = settings?.timezone ?? "Africa/Maputo";
  const day = addDays(zonedDayKey(now, tz), -1);
  if (!opts.force && localHour(now, tz) < SUMMARY_HOUR) return { ran: false, day, created: 0 };
  const key = `daily-summary:${ownerId}:${day}`;
  if (await prisma.jobRun.findUnique({ where: { key } })) return { ran: false, day, created: 0 };

  const w = { from: startOfZonedDay(day, tz), to: startOfZonedDay(addDays(day, 1), tz) };
  const data = await loadFinanceData({ scope: scopeOf(ownerId, false), from: w.from, to: w.to });
  const currency = (settings?.defaultCurrency ?? "MZN") as CurrencyCode;
  const currencies = data.currencies.length ? data.currencies : [currency];
  const lines: string[] = [];
  for (const c of currencies) {
    const k = financeKpis(data.orders, data.refunds, c, w);
    const top = salesByProduct(data.orders, c, w).slice(0, 3);
    lines.push(
      `${k.salesCount} venda(s) confirmada(s) · bruto ${formatMoney(k.grossCents, c)}`,
      `Reembolsos ${formatMoney(k.refundCents, c)} · após reembolsos ${formatMoney(k.netAfterRefundsCents, c)}`,
      top.length ? `Mais vendidos: ${top.map((p) => `${p.name} (${p.units})`).join(", ")}` : "Sem produtos vendidos.",
    );
  }
  let created = 0;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.jobRun.create({ data: { key } });
      created = await notifyUsers(tx, { type: "DAILY_SUMMARY", eventKey: `daily:${day}`, title: `Resumo de ${day.split("-").reverse().join("/")}`, body: lines.join("\n"), url: `/relatorios?range=custom&from=${day}&to=${day}` }, { userIds: [ownerId] });
    });
  } catch {
    return { ran: false, day, created: 0 }; // outra execução já tratou este dia
  }
  return { ran: true, day, created };
}

/** Resumo diário de todas as contas aprovadas que o ativaram (cada uma com os seus próprios dados). */
export async function runDailySummary(now = new Date(), opts: { force?: boolean } = {}): Promise<{ ran: boolean; day: string; created: number }> {
  const users = await prisma.user.findMany({
    where: { status: "APPROVED", bannedAt: null, notificationPreference: { dailySummary: true } },
    select: { id: true },
    take: 500,
  });
  let ran = false;
  let created = 0;
  let day = addDays(zonedDayKey(now, "Africa/Maputo"), -1);
  for (const u of users) {
    const r = await runDailySummaryFor(u.id, now, opts).catch(() => null);
    if (!r) continue;
    day = r.day;
    ran ||= r.ran;
    created += r.created;
  }
  return { ran, day, created };
}

/**
 * Tarefas de fundo baratas, executadas depois da resposta quando o painel é aberto e pelo cron diário:
 * envia a fila push pendente e gera o resumo diário em falta. Nada depende de processos em memória.
 */
export async function runNotificationJobs(now = new Date(), opts: { userId?: string } = {}) {
  const summary = await runDailySummary(now).catch((e) => {
    console.error("[notificações] resumo diário", e);
    return null;
  });
  // BARÃO (manhã, noite, resumo semanal): no painel só para quem o abriu; no cron para todas as contas
  const { runBarao } = await import("./barao");
  const barao = await runBarao(now, opts).catch((e) => {
    console.error("[barão] rotina", e instanceof Error ? e.message : "erro");
    return null;
  });
  const outbox = (await hasDuePushDeliveries()) ? await processPushOutbox(50) : { processed: 0, sent: 0, failed: 0 };
  // Meta: rede de segurança e novas tentativas dos eventos Purchase (idempotente)
  const { processMetaOutbox } = await import("@/server/services/meta-capi");
  const meta = await processMetaOutbox(50).catch((e) => {
    console.error("[meta] rotina", e instanceof Error ? e.message : "erro");
    return null;
  });
  return { summary, barao, outbox, meta };
}
