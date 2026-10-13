import { NextResponse } from "next/server";
import { fileForBuyer } from "@/server/services/product-files";

export const dynamic = "force-dynamic";

// Download de um PDF privado: só para o titular do acesso de uma encomenda paga que inclua o produto.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; fileId: string }> }) {
  const { token, fileId } = await params;
  const file = await fileForBuyer(token, fileId);
  if (!file) return new NextResponse("Acesso indisponível.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  return new NextResponse(new Uint8Array(file.data), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-length": String(file.sizeBytes),
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      // nunca guardado em caches partilhadas; o acesso é sempre revalidado
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });
}
