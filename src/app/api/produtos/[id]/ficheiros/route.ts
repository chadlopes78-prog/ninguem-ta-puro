import { NextResponse, type NextRequest } from "next/server";
import { getActiveUser } from "@/server/auth/session";
import { getScope } from "@/server/services/settings";
import { MAX_PDF_BYTES, saveProductPdf } from "@/server/services/product-files";
import { DomainError, NotFoundError } from "@/server/services/products";

// Carregamento de PDF de um produto (apenas utilizadores autenticados do painel).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // conta aprovada e não suspensa; o PDF só pode ser associado a um produto da própria conta
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Sessão expirada. Inicie sessão novamente." }, { status: 401 });
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return NextResponse.json({ error: "Produto inválido." }, { status: 400 });
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_PDF_BYTES + 64 * 1024) return NextResponse.json({ error: "O PDF tem mais de 4 MB." }, { status: 413 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const f = form.get("file");
  if (!(f instanceof File)) return NextResponse.json({ error: "Escolha um ficheiro PDF." }, { status: 400 });
  if (f.type && f.type !== "application/pdf") return NextResponse.json({ error: "Apenas ficheiros PDF." }, { status: 400 });
  try {
    const { scope } = await getScope();
    const saved = await saveProductPdf(id, scope, { name: f.name, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) });
    return NextResponse.json({ file: saved });
  } catch (e) {
    if (e instanceof DomainError || e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[upload]", e);
    return NextResponse.json({ error: "Não foi possível guardar o ficheiro." }, { status: 500 });
  }
}
