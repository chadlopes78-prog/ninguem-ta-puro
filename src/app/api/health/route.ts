import { NextResponse } from "next/server";
import { getSystemHealth } from "@/server/health";

export const dynamic = "force-dynamic";

// Diagnóstico da instalação (útil após um deploy). Só indica se cada configuração existe — nunca valores.
export async function GET() {
  const h = await getSystemHealth();
  return NextResponse.json(h, { status: h.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
