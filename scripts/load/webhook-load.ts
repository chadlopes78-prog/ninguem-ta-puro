// Confirmações de pagamento em massa pelo endpoint real de avisos (/api/webhooks/teste-local), APENAS em ntp_test
// com o fornecedor de teste. Cada aviso é enviado DUAS vezes em simultâneo (o gateway pode repetir avisos).
// Depois verifica na base de dados: cada encomenda aprovada uma única vez, uma entrega e uma notificação de venda.
// Uso: set -a; . ./.env.test; set +a; TEST_PROVIDER_SECRET=... npx tsx scripts/load/webhook-load.ts <base> <ownerEmail> <limite> <concorrência>
import { createHmac } from "crypto";
import { prisma } from "../../src/server/db";

async function main() {
  if (!process.env.DATABASE_URL?.includes("/ntp_test")) throw new Error("apenas ntp_test");
  const [base, email, limitArg, concArg] = process.argv.slice(2);
  const secret = process.env.TEST_PROVIDER_SECRET!;
  const owner = await prisma.user.findUniqueOrThrow({ where: { email } });
  const payments = await prisma.payment.findMany({
    where: { provider: "teste-local", status: "PENDING", order: { ownerId: owner.id, status: "PENDING" } },
    take: Number(limitArg),
    select: { id: true, externalId: true, idempotencyKey: true, amountCents: true, orderId: true },
  });
  const jobs = payments.flatMap((p) => {
    const raw = JSON.stringify({ eventId: `ev_${p.id}_paid`, externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
    const sig = createHmac("sha256", secret).update(raw).digest("hex");
    return [raw, raw].map((body) => ({ body, sig }));
  });
  const conc = Number(concArg);
  const codes: Record<string, number> = {};
  const lat: number[] = [];
  let i = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: conc }, async () => {
      while (i < jobs.length) {
        const j = jobs[i++];
        const s = performance.now();
        try {
          const r = await fetch(`${base}/api/webhooks/teste-local`, { method: "POST", headers: { "content-type": "application/json", "x-test-signature": j.sig }, body: j.body });
          await r.arrayBuffer();
          codes[r.status] = (codes[r.status] ?? 0) + 1;
        } catch {
          codes["rede"] = (codes["rede"] ?? 0) + 1;
        }
        lat.push(performance.now() - s);
      }
    }),
  );
  const secs = (performance.now() - t0) / 1000;
  lat.sort((a, b) => a - b);
  const ids = payments.map((p) => p.orderId);
  const [approved, deliveries, notifications, audits] = await Promise.all([
    prisma.order.count({ where: { id: { in: ids }, status: "APPROVED" } }),
    prisma.delivery.groupBy({ by: ["orderId"], where: { orderId: { in: ids } }, _count: { _all: true } }),
    prisma.notification.groupBy({ by: ["orderId"], where: { orderId: { in: ids }, type: "SALE_CONFIRMED" }, _count: { _all: true } }),
    prisma.orderAuditLog.groupBy({ by: ["orderId"], where: { orderId: { in: ids }, toStatus: "APPROVED" }, _count: { _all: true } }),
  ]);
  console.log(
    JSON.stringify({
      payments: payments.length,
      requests: jobs.length,
      concurrency: conc,
      rps: Math.round(jobs.length / secs),
      p50: Math.round(lat[Math.floor(lat.length / 2)] ?? 0),
      p95: Math.round(lat[Math.floor(lat.length * 0.95)] ?? 0),
      codes,
      ordersApproved: approved,
      ordersWithDuplicateDelivery: deliveries.filter((d) => d._count._all > 1).length,
      ordersWithDelivery: deliveries.length,
      ordersWithDuplicateSaleNotification: notifications.filter((d) => d._count._all > 1).length,
      ordersWithSaleNotification: notifications.length,
      ordersApprovedTwiceInAudit: audits.filter((d) => d._count._all > 1).length,
    }),
  );
}
main().finally(() => prisma.$disconnect());
