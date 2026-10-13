// Estado de uma entrega push do próprio utilizador (usado pelo botão "Enviar notificação de teste").
import { getCurrentUser } from "@/server/auth/session";
import { json } from "@/server/notifications/http";
import { deliveryStatus } from "@/server/notifications/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Não autenticado" }, 401);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9]{20,40}$/i.test(id)) return json({ error: "Pedido inválido" }, 400);
  const d = await deliveryStatus(user.id, id);
  if (!d) return json({ error: "Não encontrado" }, 404);
  return json(d);
}
