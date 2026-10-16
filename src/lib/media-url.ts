// Versões redimensionadas das imagens da biblioteca (/api/public/media/<id>?w=<largura>&f=webp).
// Só se aplica a imagens carregadas na plataforma; endereços externos (https) ficam como estão.

/** Larguras servidas (px). Outras larguras pedidas são recusadas pelo servidor (evita gerar variantes arbitrárias). */
export const MEDIA_WIDTHS = [160, 320, 480, 640, 828, 1080] as const;
const MEDIA_PATH = /^\/api\/public\/media\/[a-z0-9]{20,40}$/;

export function isLibraryMedia(src: string | null | undefined): src is string {
  return Boolean(src && MEDIA_PATH.test(src));
}

/**
 * Atributos de uma imagem responsiva: `srcSet` em WebP para os browsers atuais e `src` de recurso (formato
 * original redimensionado) para os antigos. `maxWidth` limita a maior variante pedida.
 */
export function responsiveImage(src: string, maxWidth = 1080): { src: string; srcSet?: string; webpSrcSet?: string } {
  if (!isLibraryMedia(src)) return { src };
  const widths = MEDIA_WIDTHS.filter((w) => w <= maxWidth);
  const fallback = widths[widths.length - 1] ?? MEDIA_WIDTHS[0];
  return {
    src: `${src}?w=${fallback}`,
    srcSet: widths.map((w) => `${src}?w=${w} ${w}w`).join(", "),
    webpSrcSet: widths.map((w) => `${src}?w=${w}&f=webp ${w}w`).join(", "),
  };
}
