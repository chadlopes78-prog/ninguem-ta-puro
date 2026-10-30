// BARÃO: mensagens da manhã e da noite e resumo semanal, por conta.
//
// Reutiliza a infraestrutura existente: `notifyUsers` (preferências, idempotência por (userId, eventKey) e fila push
// persistente) e o mesmo cálculo financeiro dos Relatórios (`loadFinanceData` + `financeKpis`: vendas confirmadas
// após reembolsos, sem pagamentos de teste nem demonstração). Cada conta só usa os seus próprios dados.
//
// Horários (fuso da conta, por omissão Africa/Maputo):
//   manhã  07:00–11:59 · noite 19:00–23:59 · resumo semanal no domingo à noite (em vez da mensagem da noite).
// Corre pelo cron (07:10 e 19:10 em Maputo) e, como rede de segurança, quando o próprio utilizador abre o painel.
import "server-only";
import type { NotificationType } from "@prisma/client";
import { prisma } from "@/server/db";
import { addDays, startOfZonedDay, zonedDayKey } from "@/lib/dates";
import type { CurrencyCode } from "@/lib/money";
import { DEFAULT_PREFS, isAllowed } from "@/lib/notifications";
import { eveningMessage, morningMessage, showsProfit, weeklyMessage } from "@/lib/barao";
import { loadFinanceData } from "@/server/services/finance";
import { financeKpis } from "@/server/services/finance-logic";
import { scopeOf } from "@/server/scope";
import { notifyUsers } from "./events";

export type BaraoSlot = "morning" | "evening" | "weekly";

function localHour(now: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Segunda-feira (AAAA-MM-DD) da semana de um dia. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(day, -((dow + 6) % 7));
}

/** Que mensagem cabe agora, no fuso da conta (null fora das janelas da manhã e da noite). */
export function baraoSlotAt(now: Date, tz: string): { slot: BaraoSlot; day: string } | null {
  const h = localHour(now, tz);
  const day = zonedDayKey(now, tz);
  if (h >= 7 && h < 12) return { slot: "morning", day };
  if (h >= 19) return { slot: new Date(`${day}T00:00:00Z`).getUTCDay() === 0 ? "weekly" : "evening", day };
  return null;
}

/** Lucro real da semana (segunda 00:00 → `until`), após reembolsos, só desta conta. */
async function weekProfit(ownerId: string, monday: string, until: Date, tz: string, currency: CurrencyCode) {
  const from = startOfZonedDay(monday, tz);
  const data = await loadFinanceData({ scope: scopeOf(ownerId, false), from, to: until });
  return { cents: financeKpis(data.orders, data.refunds, currency, { from, to: until }).netAfterRefundsCents, currency };
}

const TYPE: Record<BaraoSlot, NotificationType> = { morning: "MORNING_MESSAGE", evening: "EVENING_MESSAGE", weekly: "WEEKLY_SUMMARY" };

/**
 * Envia a mensagem BARÃO que cabe agora a UMA conta (no máximo uma por período: a chave do evento é única por
 * conta). `force` escolhe o período sem olhar para a hora (testes). Devolve o período tratado ou null.
 */
export async function runBaraoFor(userId: string, now = new Date(), opts: { force?: { slot: BaraoSlot; day: string } } = {}): Promise<{ slot: BaraoSlot; created: number } | null> {
  const [settings, pref] = await Promise.all([
    prisma.settings.findUnique({ where: { ownerId: userId }, select: { timezone: true, defaultCurrency: true } }),
    prisma.notificationPreference.findUnique({ where: { userId } }),
  ]);
  const tz = settings?.timezone || "Africa/Maputo";
  const at = opts.force ?? baraoSlotAt(now, tz);
  if (!at) return null;
  const type = TYPE[at.slot];
  if (!isAllowed({ ...DEFAULT_PREFS, ...(pref ?? {}) }, type)) return null;

  const monday = weekStart(at.day);
  const eventKey = at.slot === "weekly" ? `weekly:${monday}` : `${at.slot}:${at.day}`;
  if (await prisma.notification.findUnique({ where: { userId_eventKey: { userId, eventKey } }, select: { id: true } })) return { slot: at.slot, created: 0 };

  const currency = (settings?.defaultCurrency ?? "MZN") as CurrencyCode;
  let msg: { title: string; body: string };
  if (at.slot === "weekly") {
    // semana completa: segunda 00:00 → segunda seguinte 00:00 (ou agora, se ainda não terminou)
    const end = startOfZonedDay(addDays(monday, 7), tz);
    msg = weeklyMessage(monday, userId, await weekProfit(userId, monday, end < now ? end : now, tz, currency));
  } else {
    // o lucro só é calculado nos dias em que a mensagem o mostra (e nunca na segunda de manhã: a semana ainda não começou)
    const wantsProfit = showsProfit(at.slot, at.day, userId) && !(at.slot === "morning" && at.day === monday);
    const profit = wantsProfit ? await weekProfit(userId, monday, now, tz, currency) : null;
    msg = at.slot === "morning" ? morningMessage(at.day, userId, profit) : eveningMessage(at.day, userId, profit);
  }
  const url = at.slot === "weekly" ? `/relatorios?range=custom&from=${monday}&to=${addDays(monday, 6)}` : "/dashboard";
  const created = await notifyUsers(prisma, { type, eventKey, title: msg.title, body: msg.body, url }, { userIds: [userId] });
  return { slot: at.slot, created };
}

/**
 * Mensagens BARÃO em falta. Com `userId` (painel aberto) só trata essa conta; sem `userId` (cron) trata todas as
 * contas aprovadas, uma a uma, cada uma com os seus próprios dados.
 */
export async function runBarao(now = new Date(), opts: { userId?: string } = {}): Promise<{ created: number }> {
  const users = opts.userId
    ? [{ id: opts.userId }]
    : await prisma.user.findMany({ where: { status: "APPROVED", bannedAt: null }, select: { id: true }, orderBy: { createdAt: "asc" }, take: 1000 });
  let created = 0;
  for (const u of users) {
    const r = await runBaraoFor(u.id, now).catch((e) => {
      console.error("[barão]", e instanceof Error ? e.message : "erro");
      return null;
    });
    created += r?.created ?? 0;
  }
  return { created };
}
