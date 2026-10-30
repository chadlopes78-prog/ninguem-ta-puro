// Tarefa agendada (Vercel Cron, uma vez por dia): resumo diário + reenvio da fila push pendente.
// Protegida por CRON_SECRET (a Vercel envia "Authorization: Bearer <CRON_SECRET>"). Sem CRON_SECRET fica desativada;
// as mesmas tarefas correm também quando o painel é aberto, por isso nada se perde.
import { timingSafeEqual } from "crypto";
import { json } from "@/server/notifications/http";
import { runNotificationJobs } from "@/server/notifications/service";
import { reconcileStalePayments } from "@/server/services/payment-flow";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) return json({ error: "CRON_SECRET não definido" }, 503);
  if (!authorized(req)) return json({ error: "Não autorizado" }, 401);
  const r = await runNotificationJobs();
  const payments = await reconcileStalePayments(50);
  return json({ ok: true, summary: r.summary, outbox: r.outbox, payments });
}
