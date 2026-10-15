// Carregamento de imagens para a biblioteca da conta (/api/media), partilhado pelo editor do checkout e pela
// foto do produto. O servidor volta a validar tudo (tipo real do ficheiro, tamanho, dimensões e conta).

export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const MAX_SIDE = 2000;

/** Reduz no browser imagens grandes (lado máximo 2000 px, WebP) — o checkout fica leve no telemóvel. GIF fica intacto. */
export async function prepareImage(file: File): Promise<File> {
  if (file.type === "image/gif" || typeof createImageBitmap !== "function") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= 1_200_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.86));
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[a-z0-9]+$/i, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

export interface UploadedImage {
  id: string;
  url: string;
  filename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
}

/** Valida (tipo e tamanho), reduz e envia a imagem. Lança um erro com mensagem clara para o utilizador. */
export async function uploadImage(file: File): Promise<UploadedImage> {
  // fotos do iPhone (HEIC) são convertidas para JPEG pelo próprio seletor do sistema quando o tipo pedido é imagem
  if (file.type && !IMAGE_ACCEPT.split(",").includes(file.type)) throw new Error("Formato não suportado. Use uma imagem JPEG, PNG, WebP ou GIF.");
  const prepared = await prepareImage(file);
  if (prepared.size > IMAGE_MAX_BYTES) throw new Error("A imagem tem mais de 3 MB. Escolha uma imagem mais pequena.");
  const fd = new FormData();
  fd.append("file", prepared);
  let r: Response;
  try {
    r = await fetch("/api/media", { method: "POST", body: fd });
  } catch {
    throw new Error("Sem ligação. Verifique a internet e tente novamente.");
  }
  const j = (await r.json().catch(() => ({}))) as { item?: UploadedImage; error?: string };
  if (!r.ok || !j.item) throw new Error(j.error ?? "Não foi possível carregar a imagem. Tente novamente.");
  return j.item;
}
