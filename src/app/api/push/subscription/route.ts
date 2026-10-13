// Registo e remoção do dispositivo atual para notificações push. Exige sessão válida e pedido da própria origem.
import { getCurrentUser } from "@/server/auth/session";
import { rateLimit } from "@/server/rate-limit";
import { json, sameOrigin } from "@/server/notifications/http";
import { revokeDevice, subscribeDevice } from "@/server/notifications/service";

export const dynamic = "force-dynamic";

async function guard(req: Request) {
  if (!sameOrigin(req)) return { error: json({ error: "Origem não permitida" }, 403) };
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return { error: json({ error: "Formato inválido" }, 415) };
  const user = await getCurrentUser();
  if (!user) return { error: json({ error: "Não autenticado" }, 401) };
  if (!rateLimit(`push-sub:${user.id}`, 20, 10 * 60_000)) return { error: json({ error: "Demasiados pedidos. Aguarde alguns minutos." }, 429) };
  let body: unknown;
  try {
    body = JSON.parse((await req.text()).slice(0, 5000));
  } catch {
    return { error: json({ error: "Formato inválido" }, 400) };
  }
  return { user, body };
}

export async function POST(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const r = await subscribeDevice(g.user.id, g.body, req.headers.get("user-agent"));
  return r.ok ? json({ ok: true, id: r.id }) : json({ error: r.error }, 400);
}

export async function DELETE(req: Request) {
  const g = await guard(req);
  if ("error" in g) return g.error;
  const endpoint = typeof (g.body as { endpoint?: unknown })?.endpoint === "string" ? ((g.body as { endpoint: string }).endpoint) : null;
  const id = typeof (g.body as { id?: unknown })?.id === "string" ? ((g.body as { id: string }).id) : undefined;
  const ok = await revokeDevice(g.user.id, id ? { id } : { endpoint: endpoint ?? undefined });
  return json({ ok });
}
