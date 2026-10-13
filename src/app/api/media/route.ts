import { NextResponse, type NextRequest } from "next/server";
import { getActiveUser } from "@/server/auth/session";
import { MAX_IMAGE_BYTES, listMedia, saveMedia } from "@/server/services/media";
import { DomainError } from "@/server/services/products";

export const dynamic = "force-dynamic";

/** Pedidos de outro site nunca podem carregar imagens na conta (além do cookie SameSite=Lax). */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  return !origin || origin === req.nextUrl.origin || origin === `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("host")}`;
}

// Biblioteca de imagens da conta autenticada (aprovada e não suspensa). Nunca devolve imagens de outra conta.
export async function GET() {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Inicie sessão novamente." }, { status: 401 });
  return NextResponse.json({ items: await listMedia(user.id) }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Inicie sessão novamente." }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: "Pedido recusado." }, { status: 403 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_IMAGE_BYTES + 64 * 1024) return NextResponse.json({ error: "A imagem tem mais de 3 MB." }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const f = form.get("file");
  if (!(f instanceof File)) return NextResponse.json({ error: "Escolha uma imagem." }, { status: 400 });
  try {
    const saved = await saveMedia(user.id, { name: f.name, bytes: Buffer.from(await f.arrayBuffer()) });
    return NextResponse.json({ item: saved });
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[media] carregamento", e);
    return NextResponse.json({ error: "Não foi possível guardar a imagem." }, { status: 500 });
  }
}
