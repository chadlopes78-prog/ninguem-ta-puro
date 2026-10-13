import { NextResponse } from "next/server";
import { getPublicMedia } from "@/server/services/media";

// Imagem da biblioteca de uma conta, mostrada nos checkouts públicos.
// Conteúdo imutável (o ID muda se a imagem mudar): cache longa no browser e na CDN.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await getPublicMedia(id);
  if (!m) return new NextResponse("Imagem não encontrada.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60" } });
  const etag = `"${m.sha256.slice(0, 32)}"`;
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { etag, "cache-control": "public, max-age=31536000, immutable" } });
  return new NextResponse(new Uint8Array(m.data), {
    status: 200,
    headers: {
      "content-type": m.mimeType,
      "content-length": String(m.sizeBytes),
      "cache-control": "public, max-age=31536000, immutable",
      etag,
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-site",
    },
  });
}
