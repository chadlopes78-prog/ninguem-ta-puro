// Exportação CSV das transações do período (mesmos filtros da página Relatórios). Exige sessão válida.
import type { OrderStatus } from "@prisma/client";
import { getCurrentUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { csvCell, listTransactions, TX_SORTS, type TxSort } from "@/server/services/finance";
import { gatewayLabel } from "@/server/services/finance-logic";
import { ORDER_STATUSES } from "@/server/services/orders";
import { ORDER_STATUS_LABELS } from "@/server/services/order-logic";
import { resolveRange, zonedDayKey } from "@/lib/dates";
import { CURRENCIES, type CurrencyCode } from "@/lib/money";
import { rateLimit } from "@/server/rate-limit";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Não autenticado", { status: 401 });
  if (!rateLimit(`csv:${user.id}`, 20, 10 * 60_000)) return new Response("Demasiadas exportações. Aguarde alguns minutos.", { status: 429 });
  const sp = new URL(req.url).searchParams;
  const { isDemo, settings } = await getScope();
  const tz = settings.timezone;
  const range = resolveRange({ preset: sp.get("range"), from: sp.get("from"), to: sp.get("to") }, tz);
  const status = sp.get("estado");
  const gateway = sp.get("gateway");
  const produto = sp.get("produto");
  const currency = sp.get("currency");
  const tx = await listTransactions(isDemo, range, {
    q: sp.get("q")?.slice(0, 100) || undefined,
    status: ORDER_STATUSES.includes(status as OrderStatus) ? (status as OrderStatus) : undefined,
    gateway: gateway && /^[a-z0-9-]{1,40}$/.test(gateway) ? gateway : undefined,
    productId: produto && /^[a-z0-9]{20,40}$/i.test(produto) ? produto : undefined,
    currency: CURRENCIES.includes(currency as CurrencyCode) ? (currency as CurrencyCode) : undefined,
    sort: TX_SORTS.includes(sp.get("ordem") as TxSort) ? (sp.get("ordem") as TxSort) : "date",
    dir: sp.get("dir") === "asc" ? "asc" : "desc",
    page: 1,
    pageSize: MAX_ROWS,
  });
  const dt = (d: Date | null) =>
    d ? new Intl.DateTimeFormat("sv-SE", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(d) : "";
  const amount = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
  const header = ["Data", "Confirmado em", "Pedido", "Produto", "Valor", "Moeda", "Estado", "Gateway", "Referência da transação", "Reembolso", "Valor reembolsado", "Pagamento de teste"];
  const lines = [header.map(csvCell).join(";")];
  for (const r of tx.rows) {
    lines.push(
      [
        dt(r.date),
        dt(r.approvedAt),
        r.code,
        r.products,
        amount(r.totalCents),
        r.currency,
        ORDER_STATUS_LABELS[r.status],
        gatewayLabel(r.gateway),
        r.reference ?? "",
        r.refundState === "none" ? "" : r.refundState === "full" ? "Total" : "Parcial",
        r.refundedCents ? amount(r.refundedCents) : "",
        r.isTestPayment ? "Sim" : "Não",
      ]
        .map(csvCell)
        .join(";"),
    );
  }
  if (tx.total > MAX_ROWS) lines.push(csvCell(`Aviso: exportadas ${MAX_ROWS} de ${tx.total} transações. Reduza o período ou use filtros.`));
  const name = `transacoes-${zonedDayKey(range.from, tz)}_${zonedDayKey(new Date(range.to.getTime() - 1), tz)}${isDemo ? "-demo" : ""}.csv`;
  // BOM para o Excel reconhecer UTF-8 (acentos)
  return new Response("﻿" + lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
  });
}
