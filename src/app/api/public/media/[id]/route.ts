import { NextResponse } from "next/server";
import { getPublicMedia } from "@/server/services/media";
import { MEDIA_WIDTHS } from "@/lib/media-url";

// Imagem da biblioteca de uma conta, mostrada nos checkouts públicos.
// Conteúdo imutável (o ID muda se a imagem mudar): cache longa no browser E na CDN (CDN-Cache-Control: a CDN da
// Vercel só guarda respostas de funções com esse cabeçalho ou s-maxage; "max-age" sozinho vale só para o browser).
// ?w=<largura> devolve uma versão redimensionada (sem aumentar) e ?f=webp em WebP: muito mais leve nos telemóveis.
const IMMUTABLE = "public, max-age=31536000, immutable";

// Cache em memória por instância (limita leituras repetidas da imagem na base de dados durante picos de tráfego)
const MAX_CACHE_BYTES = 48 * 1024 * 1024;
const cache = new Map<string, { body: Uint8Array; type: string; etag: string }>();
let cacheBytes = 0;
function remember(key: string, v: { body: Uint8Array; type: string; etag: string }) {
  if (v.body.byteLength > 8 * 1024 * 1024) return;
  cache.set(key, v);
  cacheBytes += v.body.byteLength;
  for (const [k, old] of cache) {
    if (cacheBytes <= MAX_CACHE_BYTES) break;
    cache.delete(k);
    cacheBytes -= old.body.byteLength;
  }
}
function recall(key: string) {
  const v = cache.get(key);
  if (v) {
    cache.delete(key); // mais recente no fim (LRU)
    cache.set(key, v);
  }
  return v;
}

const RESIZABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

async function resize(data: Uint8Array, mime: string, width: number, webp: boolean): Promise<{ body: Uint8Array; type: string } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const img = sharp(data, { failOn: "none" }).rotate().resize({ width, withoutEnlargement: true });
    if (webp) return { body: new Uint8Array(await img.webp({ quality: 72 }).toBuffer()), type: "image/webp" };
    if (mime === "image/png") return { body: new Uint8Array(await img.png({ compressionLevel: 9 }).toBuffer()), type: "image/png" };
    if (mime === "image/webp") return { body: new Uint8Array(await img.webp({ quality: 75 }).toBuffer()), type: "image/webp" };
    return { body: new Uint8Array(await img.jpeg({ quality: 75, mozjpeg: true }).toBuffer()), type: "image/jpeg" };
  } catch (e) {
    // sem sharp disponível ou imagem inválida: serve o original (comportamento anterior)
    console.error("[media] redimensionamento", e instanceof Error ? e.message : "erro");
    return null;
  }
}

function send(v: { body: Uint8Array; type: string; etag: string }, req: Request) {
  const headers = { etag: v.etag, "cache-control": IMMUTABLE, "cdn-cache-control": IMMUTABLE };
  if (req.headers.get("if-none-match") === v.etag) return new NextResponse(null, { status: 304, headers });
  return new NextResponse(v.body as unknown as BodyInit, {
    status: 200,
    headers: {
      ...headers,
      "content-type": v.type,
      "content-length": String(v.body.byteLength),
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cross-origin-resource-policy": "same-site",
    },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const w = Number(url.searchParams.get("w"));
  const width = (MEDIA_WIDTHS as readonly number[]).includes(w) ? w : null;
  const webp = url.searchParams.get("f") === "webp";
  const key = `${id}:${width ?? "o"}:${webp ? "webp" : "src"}`;
  const hit = recall(key);
  if (hit) return send(hit, req);

  const m = await getPublicMedia(id);
  if (!m) return new NextResponse("Imagem não encontrada.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=60" } });
  const base = m.sha256.slice(0, 32);
  let out: { body: Uint8Array; type: string; etag: string } = { body: new Uint8Array(m.data), type: m.mimeType, etag: `"${base}"` };
  if ((width || webp) && RESIZABLE.has(m.mimeType)) {
    const r = await resize(out.body, m.mimeType, width ?? 1080, webp);
    // só usa a variante se for de facto mais leve que o original
    if (r && r.body.byteLength < out.body.byteLength) out = { ...r, etag: `"${base}-${width ?? "o"}-${r.type.split("/")[1]}"` };
  }
  remember(key, out);
  return send(out, req);
}
