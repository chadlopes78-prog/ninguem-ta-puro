// Prova de domínio da Pagar: devolve APENAS o token do hostname pelo qual o ficheiro foi pedido
// (cada vendedor com app própria na Pagar usa o seu hostname — ver src/server/services/pagar-domain.ts).
import { pagarVerificationTokenFor } from "@/server/services/pagar-domain";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))?.split(",")[0];
  const token = await pagarVerificationTokenFor(host).catch(() => null);
  if (!token) return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  return new Response(token, { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
