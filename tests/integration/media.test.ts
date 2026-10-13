// Biblioteca de imagens do editor visual: validação dos ficheiros, isolamento entre contas e uso nos checkouts.
import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct } from "@/server/services/products";
import { getEditorState, publishDesign, saveDraft } from "@/server/services/checkout-design";
import { deleteMedia, listMedia, saveMedia, sniffImage, MAX_IMAGE_BYTES } from "@/server/services/media";
import { newElement, type CheckoutDesign } from "@/lib/checkout-design";
import { insertElement } from "@/lib/checkout-design-ops";
import { GET as publicMedia } from "@/app/api/public/media/[id]/route";
import { scopeOf, type Scope } from "@/server/scope";
import type { AuthUser } from "@/server/auth/service";

/** PNG 1×1 válido. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png2 = () => Buffer.concat([PNG, Buffer.from([Math.floor(Math.random() * 255)])]);
const input = (over: Record<string, unknown> = {}) => productSchema.parse({ name: "Guia Visual", description: "Descrição do guia visual de teste.", type: "EBOOK", priceCents: "100", currency: "MZN", status: "PUBLISHED", ...over });
const withImage = (d: CheckoutDesign, src: string) => {
  const img = { ...(newElement("image") as Extract<ReturnType<typeof newElement>, { type: "image" }>), src };
  return insertElement(d, img, { sectionId: d.sections[0].id, col: 0, index: 0 });
};

let A: AuthUser, B: AuthUser;
let SA: Scope, SB: Scope;
beforeEach(async () => {
  await resetTestDb();
  A = await testOwner();
  B = await testSeller("b@ex.co.mz", "Vendedora B");
  SA = scopeOf(A.id, false);
  SB = scopeOf(B.id, false);
});

describe("carregamento de imagens", () => {
  it("aceita só JPEG/PNG/WebP/GIF pelo conteúdo (não pela extensão); SVG e outros são recusados", async () => {
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(sniffImage(Buffer.from("GIF89a......"))).toBe("image/gif");
    expect(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(saveMedia(A.id, { name: "logo.png", bytes: svg })).rejects.toThrow("Formato não suportado");
    await expect(saveMedia(A.id, { name: "x.jpg", bytes: Buffer.from("<html>") })).rejects.toThrow("Formato não suportado");
    await expect(saveMedia(A.id, { name: "vazia.png", bytes: Buffer.alloc(0) })).rejects.toThrow("vazio");
    await expect(saveMedia(A.id, { name: "grande.png", bytes: Buffer.concat([PNG, Buffer.alloc(MAX_IMAGE_BYTES)]) })).rejects.toThrow("3 MB");
    const ok = await saveMedia(A.id, { name: "capa<script>.png", bytes: PNG });
    expect(ok).toMatchObject({ mimeType: "image/png", width: 1, height: 1 });
    expect(ok.filename).not.toContain("<");
    expect(ok.url).toBe(`/api/public/media/${ok.id}`);
    // a mesma imagem duas vezes reutiliza o registo
    expect((await saveMedia(A.id, { name: "outra.png", bytes: PNG })).id).toBe(ok.id);
  });

  it("é servida publicamente com tipo correto, nosniff e cache longa; IDs inválidos dão 404", async () => {
    const m = await saveMedia(A.id, { name: "a.png", bytes: PNG });
    const r = await publicMedia(new Request(`http://x${m.url}`), { params: Promise.resolve({ id: m.id }) });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("cache-control")).toContain("immutable");
    expect(Buffer.from(await r.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await publicMedia(new Request("http://x"), { params: Promise.resolve({ id: "../../etc/passwd" }) })).status).toBe(404);
    expect((await publicMedia(new Request("http://x"), { params: Promise.resolve({ id: "cl0000000000000000000000" }) })).status).toBe(404);
  });
});

describe("isolamento entre contas", () => {
  it("cada conta só lista e apaga as suas imagens", async () => {
    const a = await saveMedia(A.id, { name: "a.png", bytes: png2() });
    const b = await saveMedia(B.id, { name: "b.png", bytes: png2() });
    expect((await listMedia(A.id)).map((x) => x.id)).toEqual([a.id]);
    expect((await listMedia(B.id)).map((x) => x.id)).toEqual([b.id]);
    await expect(deleteMedia(B.id, a.id)).rejects.toThrow("não encontrad");
    expect(await prisma.mediaAsset.count({ where: { id: a.id } })).toBe(1);
    await deleteMedia(A.id, a.id);
    expect(await prisma.mediaAsset.count({ where: { id: a.id } })).toBe(0);
  });

  it("um design não pode usar imagens de outra conta (ID alterado no browser); as próprias funcionam", async () => {
    const pa = await createProduct(input(), SA);
    const pb = await createProduct(input({ name: "Produto B" }), SB);
    const imgA = await saveMedia(A.id, { name: "a.png", bytes: png2() });
    const imgB = await saveMedia(B.id, { name: "b.png", bytes: png2() });
    const dB = (await getEditorState(pb.id, SB)).draft;
    const r = await saveDraft(pb.id, withImage(dB, imgA.url), SB);
    expect(r.ok).toBe(false);
    expect(await saveDraft(pb.id, withImage(dB, imgB.url), SB)).toEqual({ ok: true });
    // e B não consegue editar o checkout de A (IDs de outra conta → não encontrado)
    await expect(saveDraft(pa.id, withImage((await getEditorState(pa.id, SA)).draft, imgB.url), SB)).rejects.toThrow("não encontrado");
    await expect(getEditorState(pa.id, SB)).rejects.toThrow("não encontrado");
    await expect(publishDesign(pa.id, SB)).rejects.toThrow("não encontrado");
  });

  it("imagem usada num checkout (rascunho ou publicado) não pode ser apagada", async () => {
    const p = await createProduct(input(), SA);
    const img = await saveMedia(A.id, { name: "a.png", bytes: png2() });
    expect(await saveDraft(p.id, withImage((await getEditorState(p.id, SA)).draft, img.url), SA)).toEqual({ ok: true });
    await publishDesign(p.id, SA);
    await expect(deleteMedia(A.id, img.id)).rejects.toThrow("está a ser usada");
    expect(await prisma.mediaAsset.count()).toBe(1);
  });
});
