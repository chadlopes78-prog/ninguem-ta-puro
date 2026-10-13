// Apresentação da oferta de upsell (página pública e pré-visualização). Sem lógica de pagamento.
import { videoEmbedUrl } from "@/lib/checkout-design";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { readableOn } from "@/lib/color";
import { cn } from "@/lib/utils";

export interface UpsellContentProps {
  /** Página pública: ocupa o ecrã inteiro (na pré-visualização ocupa só a moldura). */
  fullPage?: boolean;
  businessName: string;
  primaryColor: string;
  backgroundColor: string;
  headline: string;
  body?: string;
  imageUrl?: string;
  videoUrl?: string;
  productName: string;
  offerName: string;
  priceCents: number;
  currency: CurrencyCode;
  compareAtCents?: number | null;
  children?: React.ReactNode;
}

export function UpsellContent(p: UpsellContentProps) {
  const fg = readableOn(p.backgroundColor);
  const dark = fg === "#ffffff";
  const muted = dark ? "text-white/65" : "text-black/60";
  const embed = p.videoUrl ? videoEmbedUrl(p.videoUrl) : null;
  return (
    <div className={cn("w-full", p.fullPage ? "min-h-dvh" : "min-h-full")} style={{ background: p.backgroundColor, color: fg }} data-testid="upsell" data-mode={dark ? "dark" : "light"}>
      <header className={cn("border-b", dark ? "border-white/10" : "border-black/10")}>
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-center px-4 font-display text-[15px] font-semibold">{p.businessName}</div>
      </header>
      <div className="mx-auto max-w-xl px-5 py-10 text-center sm:py-14">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: p.primaryColor }}>
          Espere! Oferta exclusiva para si
        </p>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{p.headline || p.productName}</h1>
        {embed ? (
          <div className="mt-6 aspect-video w-full overflow-hidden rounded-2xl bg-black">
            <iframe src={embed} title="Vídeo da oferta" className="h-full w-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
          </div>
        ) : p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt="" className="mt-6 w-full rounded-2xl object-cover" />
        ) : null}
        {p.body && <p className={cn("mx-auto mt-5 max-w-md whitespace-pre-line leading-relaxed", muted)}>{p.body}</p>}
        <div className={cn("mx-auto mt-8 max-w-sm rounded-2xl border p-5", dark ? "border-white/10 bg-white/[0.04]" : "border-black/10 bg-white")}>
          <p className="font-medium">{p.productName}</p>
          <p className={cn("mt-1 text-sm", muted)}>{p.offerName}</p>
          {p.compareAtCents ? <p className={cn("mt-3 text-sm line-through", muted)}>{formatMoney(p.compareAtCents, p.currency)}</p> : null}
          <p className="mt-1 font-display text-3xl font-semibold" data-testid="upsell-price">
            {formatMoney(p.priceCents, p.currency)}
          </p>
        </div>
        {p.children}
      </div>
    </div>
  );
}
