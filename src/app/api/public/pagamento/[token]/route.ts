import { NextResponse, type NextRequest } from "next/server";
import { getPaymentView } from "@/server/services/payment-flow";
import { STATUS_IP_CEILING, rateLimit } from "@/server/rate-limit";

// Estado público do pagamento (apenas dados não sensíveis). Pode acionar uma consulta oficial ao fornecedor.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const { token } = await params;
  // por encomenda (um comprador consulta ~70 vezes em 10 min) + teto por IP (CGNAT)
  if (!rateLimit(`pay-status:${token.slice(0, 64)}`, 150, 10 * 60_000) || !rateLimit(`pay-status-ip:${ip}`, STATUS_IP_CEILING, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "30" } });
  }
  const view = await getPaymentView(token, { refresh: true });
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(
    { state: view.state, uncertain: view.uncertain, accessUrl: view.accessToken ? `/acesso/${view.accessToken}` : null },
    { headers: { "cache-control": "no-store" } },
  );
}
