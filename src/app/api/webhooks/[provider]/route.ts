import { NextResponse, type NextRequest } from "next/server";
import { getProvider } from "@/server/payments/registry";
import { handleWebhook } from "@/server/payments/webhooks";

// Endpoint preparado para webhooks de pagamento. Sem fornecedor implementado e configurado responde 404,
// por isso nenhum evento externo pode alterar pedidos nesta fase.
export async function POST(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: id } = await params;
  const provider = /^[a-z0-9-]{2,30}$/.test(id) ? getProvider(id) : null;
  if (!provider || !provider.isConfigured()) return NextResponse.json({ error: "provider not configured" }, { status: 404 });
  const raw = await req.text();
  if (raw.length > 512_000) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  try {
    const out = await handleWebhook(provider, raw, req.headers);
    return NextResponse.json(out.body, { status: out.status });
  } catch (e) {
    console.error("[webhook]", e);
    return NextResponse.json({ error: "processing error" }, { status: 500 });
  }
}
