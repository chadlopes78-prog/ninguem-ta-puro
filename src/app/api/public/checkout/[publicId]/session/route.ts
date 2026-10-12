import { NextResponse, type NextRequest } from "next/server";
import { startCheckoutSession } from "@/server/services/purchase";
import { rateLimit } from "@/server/rate-limit";

export async function POST(req: NextRequest, { params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`co-session:${ip}`, 60, 10 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  let body: { source?: unknown; medium?: unknown; campaign?: unknown } = {};
  try {
    body = await req.json();
  } catch {}
  const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 100) : undefined);
  const sessionId = await startCheckoutSession(publicId, { source: str(body.source), medium: str(body.medium), campaign: str(body.campaign) });
  if (!sessionId) return NextResponse.json({ error: "unavailable" }, { status: 404 });
  return NextResponse.json({ sessionId });
}
