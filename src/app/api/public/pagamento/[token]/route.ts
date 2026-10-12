import { NextResponse, type NextRequest } from "next/server";
import { getPaymentView } from "@/server/services/payment-flow";
import { rateLimit } from "@/server/rate-limit";

// Estado público do pagamento (apenas dados não sensíveis). Pode acionar uma consulta oficial ao fornecedor.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`pay-status:${ip}`, 120, 10 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { token } = await params;
  const view = await getPaymentView(token, { refresh: true });
  if (!view) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(
    { state: view.state, uncertain: view.uncertain, accessUrl: view.accessToken ? `/acesso/${view.accessToken}` : null },
    { headers: { "cache-control": "no-store" } },
  );
}
