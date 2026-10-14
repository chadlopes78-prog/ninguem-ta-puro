import type { Metadata } from "next";
import { ArrowDownToLine, ExternalLink, FileText, MessageCircle, PackageOpen } from "lucide-react";
import { getDeliveryPageView } from "@/server/services/delivery";
import { Unavailable } from "@/components/public/unavailable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "O seu produto", robots: { index: false, follow: false } };

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Página de entrega interna (Ninguém Tá Puro). Só abre com o acesso pessoal de uma encomenda PAGA que inclua
 * este produto. Ordem: 1.º suporte WhatsApp · 2.º ACEDER AO MEU PRODUTO · 3.º conteúdo entregue.
 */
export default async function DeliveryPage({ params }: { params: Promise<{ token: string; productId: string }> }) {
  const { token, productId } = await params;
  const v = await getDeliveryPageView(token, productId);
  if (!v) return <Unavailable title="Acesso indisponível" message="Este acesso não existe, não inclui este produto ou a encomenda ainda não está paga." />;
  const AccessIcon = v.access?.kind === "file" ? ArrowDownToLine : v.access?.external ? ExternalLink : PackageOpen;
  return (
    <main className="min-h-dvh bg-canvas px-4 py-10 text-fg sm:py-16" data-testid="delivery-page">
      <div className="mx-auto w-full max-w-xl">
        <div className="text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent/15">
            <PackageOpen className="h-7 w-7 text-accent" aria-hidden="true" />
          </span>
          <p className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-subtle">
            {v.productName} · Encomenda <span className="font-mono">{v.code}</span>
          </p>
          <h1 className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-tight sm:text-[34px]" data-testid="delivery-title">
            {v.title}
          </h1>
          {v.welcome && <p className="mt-3 whitespace-pre-line text-[15.5px] leading-relaxed text-muted">{v.welcome}</p>}
        </div>

        <div className="mt-8 flex flex-col gap-3" data-testid="delivery-actions">
          {/* 1.º Suporte WhatsApp */}
          {v.support && (
            <a href={v.support} target="_blank" rel="noopener noreferrer" className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-surface px-5 py-3 text-center text-[15px] font-semibold hover:bg-surface-2" data-testid="delivery-whatsapp">
              <MessageCircle className="h-5 w-5 shrink-0 text-[#25D366]" aria-hidden="true" /> Precisa de ajuda? Fale com o nosso suporte no WhatsApp.
            </a>
          )}
          {/* 2.º Acesso ao produto (ligado ao ficheiro, link ou conteúdo reais) */}
          {v.access ? (
            <a
              href={v.access.href}
              target={v.access.external ? "_blank" : undefined}
              rel={v.access.external ? "noopener noreferrer" : undefined}
              className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-3.5 text-center text-[16px] font-bold uppercase tracking-wide text-accent-ink shadow-sm hover:bg-accent-strong"
              data-testid="delivery-access"
              data-kind={v.access.kind}
            >
              <AccessIcon className="h-5 w-5 shrink-0" aria-hidden="true" /> {v.buttonText}
            </a>
          ) : (
            <p className="rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">O vendedor ainda está a preparar o acesso. Contacte o suporte se precisar de ajuda.</p>
          )}
          {v.access?.external && <p className="text-center text-[12px] text-subtle">Abre noutra página. O acesso nesse destino depende das permissões e do funcionamento da plataforma externa.</p>}
        </div>

        {v.instructions && (
          <section className="mt-8 rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-subtle">Como aceder</h2>
            <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{v.instructions}</p>
          </section>
        )}

        {v.bodyText && (
          <section id="conteudo" className="mt-4 scroll-mt-6 rounded-2xl border border-line bg-surface p-5" data-testid="delivery-content">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-subtle">Conteúdo</h2>
            <div className="mt-2 whitespace-pre-line text-[15px] leading-relaxed [overflow-wrap:anywhere]">{v.bodyText}</div>
          </section>
        )}

        {(v.files.length > 0 || v.resourceUrl) && (
          <section className="mt-4 rounded-2xl border border-line bg-surface p-5" data-testid="delivery-materials">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.12em] text-subtle">Materiais</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {v.files.map((f) => (
                <li key={f.id}>
                  <a href={f.href} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-3 text-sm hover:bg-surface-2">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
                      <span className="truncate font-medium">{f.filename}</span>
                    </span>
                    <span className="shrink-0 text-[12px] text-subtle">{size(f.sizeBytes)} · Descarregar</span>
                  </a>
                </li>
              ))}
              {v.resourceUrl && (
                <li>
                  <a href={v.resourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-3 text-sm hover:bg-surface-2">
                    <span className="font-medium">Recurso complementar</span> <ExternalLink className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                  </a>
                </li>
              )}
            </ul>
          </section>
        )}

        <p className="mt-8 text-center text-[12px] text-subtle">Guarde este endereço: é o seu acesso pessoal a esta compra. Não o partilhe.</p>
      </div>
    </main>
  );
}
