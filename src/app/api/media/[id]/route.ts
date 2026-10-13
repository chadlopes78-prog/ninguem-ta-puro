import { NextResponse, type NextRequest } from "next/server";
import { getActiveUser } from "@/server/auth/session";
import { deleteMedia } from "@/server/services/media";
import { DomainError, NotFoundError } from "@/server/services/products";

// Apagar uma imagem: só a conta dona (IDs de outra conta respondem "não encontrada").
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Inicie sessão novamente." }, { status: 401 });
  const origin = req.headers.get("origin");
  if (origin && origin !== req.nextUrl.origin && origin !== `${req.headers.get("x-forwarded-proto") ?? "https"}://${req.headers.get("host")}`) return NextResponse.json({ error: "Pedido recusado." }, { status: 403 });
  const { id } = await params;
  if (!/^[a-z0-9]{20,40}$/.test(id)) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
  try {
    await deleteMedia(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: "Imagem não encontrada." }, { status: 404 });
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
}
