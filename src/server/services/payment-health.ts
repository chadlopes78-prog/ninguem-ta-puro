// Saúde dos pagamentos (Administração da Plataforma): métricas técnicas agregadas de toda a plataforma, sem valores
// nem dados comerciais de nenhuma conta. Lê só tabelas existentes com janelas curtas e índices
// (Payment: status+createdAt; PaymentEvent: provider+externalEventId; IntegrationLog: provider+createdAt).
import "server-only";
import { prisma } from "@/server/db";

export interface PaymentHealth {
  windowMinutes: number;
  /** Tentativas de pagamento por minuto (últimos 60 min), da mais antiga para a mais recente */
  perMinute: { minute: string; attempts: number }[];
  attempts: number;
  peakPerMinute: number;
  paid: number;
  failed: number;
  canceled: number;
  pending: number;
  /** pagos / (pagos + falhados + cancelados), null sem resultados finais */
  approvalRate: number | null;
  failureRate: number | null;
  /** Tempo de resposta do gateway ao criar a cobrança, por gateway */
  latency: { provider: string; count: number; avgMs: number; p95Ms: number }[];
  /** Pendentes há mais de 10 minutos (à espera de aviso/consulta) */
  stuckPending: number;
  /** Avisos recebidos e ainda não processados há mais de 1 minuto */
  webhooksDelayed: number;
  webhooksFailed: number;
  webhookAvgProcessMs: number | null;
  /** Erros registados pelos gateways (criação recusada, sem resposta, credenciais) */
  gatewayErrors: { provider: string; count: number }[];
  /** Memória desta instância do servidor (cada instância Vercel é independente) */
  instance: { rssMb: number; heapUsedMb: number; uptimeMin: number };
}

export async function getPaymentHealth(now = new Date(), windowMinutes = 60): Promise<PaymentHealth> {
  const since = new Date(now.getTime() - windowMinutes * 60_000);
  const [perMinuteRows, byStatus, latencyRows, stuckPending, webhooksDelayed, webhooksFailed, webhookAvg, gatewayErrors] = await Promise.all([
    prisma.$queryRaw<{ minute: Date; attempts: bigint }[]>`
      SELECT date_trunc('minute', "createdAt") AS minute, count(*) AS attempts
      FROM "Payment" WHERE "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`,
    prisma.payment.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    prisma.$queryRaw<{ provider: string; count: bigint; avg: number; p95: number }[]>`
      SELECT provider, count(*) AS count, avg("chargeLatencyMs")::float AS avg,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY "chargeLatencyMs")::float AS p95
      FROM "Payment" WHERE "createdAt" >= ${since} AND "chargeLatencyMs" IS NOT NULL GROUP BY provider ORDER BY provider`,
    prisma.payment.count({ where: { status: { in: ["CREATED", "PENDING"] }, createdAt: { lt: new Date(now.getTime() - 10 * 60_000), gte: new Date(now.getTime() - 7 * 24 * 3600_000) } } }),
    prisma.paymentEvent.count({ where: { status: "RECEIVED", receivedAt: { lt: new Date(now.getTime() - 60_000), gte: since } } }),
    prisma.paymentEvent.count({ where: { status: "FAILED", receivedAt: { gte: since } } }),
    prisma.$queryRaw<{ avg: number | null }[]>`
      SELECT avg(extract(epoch FROM ("processedAt" - "receivedAt")) * 1000)::float AS avg
      FROM "PaymentEvent" WHERE "receivedAt" >= ${since} AND "processedAt" IS NOT NULL`,
    prisma.integrationLog.groupBy({ by: ["provider"], where: { level: "error", createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  const count = (s: string) => byStatus.find((r) => r.status === s)?._count._all ?? 0;
  const paid = count("PAID");
  const failed = count("FAILED");
  const canceled = count("CANCELED");
  const pending = count("PENDING") + count("CREATED");
  const finals = paid + failed + canceled;
  const perMinute = perMinuteRows.map((r) => ({ minute: r.minute.toISOString(), attempts: Number(r.attempts) }));
  const mem = process.memoryUsage();
  return {
    windowMinutes,
    perMinute,
    attempts: perMinute.reduce((s, r) => s + r.attempts, 0),
    peakPerMinute: perMinute.reduce((m, r) => Math.max(m, r.attempts), 0),
    paid,
    failed,
    canceled,
    pending,
    approvalRate: finals ? paid / finals : null,
    failureRate: finals ? (failed + canceled) / finals : null,
    latency: latencyRows.map((r) => ({ provider: r.provider, count: Number(r.count), avgMs: Math.round(r.avg), p95Ms: Math.round(r.p95) })),
    stuckPending,
    webhooksDelayed,
    webhooksFailed,
    webhookAvgProcessMs: webhookAvg[0]?.avg != null ? Math.round(webhookAvg[0].avg) : null,
    gatewayErrors: gatewayErrors.map((g) => ({ provider: g.provider, count: g._count._all })).sort((a, b) => b.count - a.count),
    instance: { rssMb: Math.round(mem.rss / 1048576), heapUsedMb: Math.round(mem.heapUsed / 1048576), uptimeMin: Math.round(process.uptime() / 60) },
  };
}
