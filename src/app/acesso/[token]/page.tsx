import type { Metadata } from "next";
import Link from "next/link";
import { Download, ExternalLink, MessageCircle, PackageCheck } from "lucide-react";
import { getAccessArea } from "@/server/services/delivery";
import { getSettings } from "@/server/services/settings";
import { Unavailable } from "@/components/public/unavailable";
import { CopyButton } from "@/components/ui/copy-button";
import { resolveAppBaseUrl } from "@/server/app-url";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Os meus produtos", robots: { index: false } };

const KIND = { MAIN: "Produto", UPSELL: "Upsell", DOWNSELL: "Downsell", ORDER_BUMP: "Oferta adicional" } as const;

export default async function AccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Só existe com a compra paga (confirmada pelo processador); cada produto pago tem o seu acesso.
  const area = await getAccessArea(token);
  if (!area) return <Unavailable title="Acesso indisponível" message="Este acesso não existe ou a compra não está paga." />;
  const [settings, base] = await Promise.all([getSettings(area.ownerId), resolveAppBaseUrl()]);
  const personal = `${base}/acesso/${area.rootToken ?? token}`;
  return (
    <main className="min-h-dvh px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <PackageCheck className="mx-auto h-11 w-11 text-accent" aria-hidden="true" />
        <h1 className="mt-5 text-center font-display text-2xl font-semibold">Os seus produtos</h1>
        <p className="mt-1 text-center text-sm text-muted">
          Encomenda <span className="font-mono">{area.code}</span> · {settings.businessName}
        </p>
        <ul className="mt-8 flex flex-col gap-3" data-testid="access-products">
          {area.products.map((p, idx) => (
            <li key={idx} className="rounded-[var(--radius-lg)] border border-line bg-surface p-4" data-testid="access-product">
              <div className="flex items-center gap-3">
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-[var(--radius-md)] border border-line object-cover" data-testid="access-product-image" />
                )}
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-subtle">{KIND[p.kind]}</p>
                  <p className="font-medium">{p.name}</p>
                </div>
              </div>
              {p.action ? (
                <a
                  href={p.action.href}
                  target={p.action.external ? "_blank" : undefined}
                  rel={p.action.external ? "noopener noreferrer" : undefined}
                  className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-accent-ink"
                  data-testid="delivery-link"
                >
                  {p.action.kind === "file" ? <Download className="h-4 w-4" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />} {p.action.label}
                </a>
              ) : (
                <p className="mt-2 text-sm text-muted">O acesso a este produto será disponibilizado pelo vendedor.</p>
              )}
              {p.support && (
                <a href={p.support} target="_blank" rel="noopener noreferrer" className="mt-2 flex items-center gap-1.5 text-[13px] text-muted underline underline-offset-2">
                  <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" /> Precisa de ajuda? Fale com o suporte no WhatsApp
                </a>
              )}
            </li>
          ))}
        </ul>
        {area.legacyFiles.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3" data-testid="delivery-files">
            {area.legacyFiles.map((f) => (
              <li key={f.id} className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
                <p className="font-medium">{f.productName}</p>
                <a href={f.href} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-accent-ink">
                  <Download className="h-4 w-4" aria-hidden="true" /> Descarregar {f.filename}
                </a>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 rounded-[var(--radius-lg)] border border-line bg-surface-2 p-4 text-[13px] text-muted" data-testid="access-personal-link">
          <p className="font-medium text-fg">Guarde este endereço — é o seu acesso pessoal</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1.5 text-[12px] text-fg">{personal}</code>
            <CopyButton value={personal} size="icon" label="Copiar link de acesso" />
          </div>
          <p className="mt-2 text-[12px] text-subtle">
            Não o partilhe. Se o perder, recupere-o em <Link href="/acesso" className="underline">/acesso</Link> com o email e o código da encomenda.
          </p>
        </div>
      </div>
    </main>
  );
}
