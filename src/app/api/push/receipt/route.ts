// Confirmação de receção enviada pelo service worker quando a notificação chega ao dispositivo.
// Público (o service worker pode correr sem sessão), protegido pelo token aleatório incluído no conteúdo cifrado.
import { rateLimit } from "@/server/rate-limit";
import { json } from "@/server/notifications/http";
import { confirmReceipt } from "@/server/notifications/service";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`push-receipt:${ip}`, 120, 60_000)) return json({ ok: false }, 429);
  let body: { d?: unknown; t?: unknown };
  try {
    body = JSON.parse((await req.text()).slice(0, 1000));
  } catch {
    return json({ ok: false }, 400);
  }
  if (typeof body.d !== "string" || typeof body.t !== "string") return json({ ok: false }, 400);
  return json({ ok: await confirmReceipt(body.d, body.t) });
}
