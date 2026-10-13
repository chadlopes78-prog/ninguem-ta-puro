import { NextResponse, type NextRequest } from "next/server";
import { handleProviderWebhook } from "@/server/payments/webhooks";

// Avisos de pagamento dos fornecedores. Cada aviso é verificado com as credenciais da conta dona da venda
// (handleProviderWebhook); fornecedores sem avisos documentados (E2Payments) ou desconhecidos respondem 404.
// Um gateway desativado continua a receber confirmações de pagamentos já iniciados.
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  if (!/^[a-z0-9-]{2,30}$/.test(id)) return NextResponse.json({ error: "provider not configured" }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  try {
    const out = await handleProviderWebhook(id, raw, req.headers);
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    console.error("[webhook]", e instanceof Error ? e.message : "erro");
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }
}
