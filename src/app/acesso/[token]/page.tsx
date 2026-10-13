import type { Metadata } from "next";
import { ExternalLink, PackageCheck } from "lucide-react";
import { getDeliveryView } from "@/server/services/payment-flow";
import { getSettings } from "@/server/services/settings";
import { filesForDelivery } from "@/server/services/product-files";
import { Download } from "lucide-react";
import { Unavailable } from "@/components/public/unavailable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Acesso ao produto", robots: { index: false } };

export default async function AccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Só devolve dados quando a encomenda está paga (confirmada pelo processador).
  const view = await getDeliveryView(token);
  if (!view) return <Unavailable title="Acesso indisponível" message="Este acesso não existe ou a encomenda não está paga." />;
  const [settings, files] = await Promise.all([getSettings(), filesForDelivery(token)]);
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <PackageCheck className="mx-auto h-11 w-11 text-accent" aria-hidden="true" />
        <h1 className="mt-5 text-center font-display text-2xl font-semibold">Os seus produtos</h1>
        <p className="mt-1 text-center text-sm text-muted">
          Encomenda <span className="font-mono">{view.code}</span> · {settings.businessName}
        </p>
        <ul className="mt-8 flex flex-col gap-3">
          {view.items.map((i, idx) => (
            <li key={idx} className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
              <p className="font-medium">{i.name}</p>
              {i.url ? (
                <a href={i.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-accent-ink" data-testid="delivery-link">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> Abrir conteúdo
                </a>
              ) : (
                <p className="mt-2 text-sm text-muted">O acesso a este produto será enviado pelo vendedor{i.support ? ` (${i.support})` : ""}.</p>
              )}
            </li>
          ))}
        </ul>
        {files.length > 0 && (
          <ul className="mt-3 flex flex-col gap-3" data-testid="delivery-files">
            {files.map((f) => (
              <li key={f.id} className="rounded-[var(--radius-lg)] border border-line bg-surface p-4">
                <p className="font-medium">{f.product.name}</p>
                <a href={`/acesso/${token}/ficheiro/${f.id}`} className="mt-3 inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-accent-ink">
                  <Download className="h-4 w-4" aria-hidden="true" /> Descarregar {f.filename}
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-6 text-center text-[12px] text-subtle">Guarde este endereço: é o seu acesso pessoal à compra.</p>
      </div>
    </main>
  );
}
