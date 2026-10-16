// Imagem leve para páginas públicas: as imagens da biblioteca são servidas redimensionadas (WebP com recurso ao
// formato original) de acordo com a largura do ecrã. Endereços externos são mostrados tal como estão.
import { responsiveImage } from "@/lib/media-url";

type Props = React.ImgHTMLAttributes<HTMLImageElement> & { src: string; sizes?: string; maxWidth?: number };

export function ResponsiveImg({ src, sizes = "(max-width: 640px) 100vw, 640px", maxWidth, alt = "", ...img }: Props) {
  const r = responsiveImage(src, maxWidth);
  if (!r.srcSet) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} {...img} />;
  }
  return (
    <picture className="contents">
      <source type="image/webp" srcSet={r.webpSrcSet} sizes={sizes} />
      <img src={r.src} srcSet={r.srcSet} sizes={sizes} alt={alt} {...img} />
    </picture>
  );
}
