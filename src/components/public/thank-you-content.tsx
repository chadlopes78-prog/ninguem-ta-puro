// Página de obrigado (apresentação). Usada na página pública e na pré-visualização do editor.
// Não decide nada sobre pagamentos: recebe o estado e o botão já calculados no servidor.
import { CheckCircle2, Clock, Download, ExternalLink, Info, MessageCircle, XCircle } from "lucide-react";
import { FONT_STACKS, type ThankYouDesign } from "@/lib/thank-you";
import { formatMoney, type CurrencyCode } from "@/lib/money";
import { readableOn } from "@/lib/color";
import { cn } from "@/lib/utils";

export interface ThankYouContentProps {
  /** Página pública: ocupa o ecrã inteiro (na pré-visualização ocupa só a moldura). */
  fullPage?: boolean;
  design: ThankYouDesign;
  state: "confirmed" | "pending" | "failed";
  businessName: string;
  code?: string;
  customerFirstName?: string;
  items?: { description: string; totalCents: number }[];
  totalCents?: number;
  currency: CurrencyCode;
  button: { label: string; href: string; external: boolean } | null;
  /** Suporte via WhatsApp do vendedor (aparece ACIMA do botão de acesso) */
  support?: { href: string; label: string } | null;
  buttonKind?: "pdf" | "link" | "whatsapp" | "access" | null;
  upsells?: { description: string; totalCents: number; status: string; accessHref: string | null }[];
  upsellNote?: string | null;
  /** Nome do produto principal (mostrado com o botão de acesso) */
  mainProductName?: string | null;
  /** Upsells/downsells PAGOS: cada produto com o seu próprio acesso */
  extraProducts?: { name: string; kind: "UPSELL" | "DOWNSELL" | "MAIN" | "ORDER_BUMP"; label: string; href: string; external: boolean; file: boolean }[];
  /** Tamanho do título (página personalizada) */
  titleSize?: "sm" | "md" | "lg";
  /** Área de acesso pessoal (todos os produtos desta compra) */
  accessAreaHref?: string | null;
  /** "Redirecionar para" configurado na etapa de obrigado (só com a compra confirmada) */
  continueUrl?: string | null;
  supportEmail?: string | null;
  retryPath?: string | null;
  /** Pré-visualização no editor: links desativados */
  preview?: boolean;
}

const SPACING = { compact: "py-8 gap-4", normal: "py-12 gap-6 sm:py-16", spacious: "py-16 gap-8 sm:py-24" } as const;

export function ThankYouContent(p: ThankYouContentProps) {
  const d = p.design;
  const fg = readableOn(d.backgroundColor);
  const dark = fg === "#ffffff";
  const onPrimary = readableOn(d.primaryColor);
  const muted = dark ? "text-white/65" : "text-black/60";
  const card = dark ? "border-white/10 bg-white/[0.04]" : "border-black/10 bg-white";
  const center = d.align === "center";
  const confirmed = p.state === "confirmed";
  const Icon = confirmed ? CheckCircle2 : p.state === "pending" ? Clock : XCircle;
  const ButtonIcon = p.buttonKind === "whatsapp" ? MessageCircle : p.buttonKind === "pdf" ? Download : ExternalLink;
  const title = confirmed ? d.title : p.state === "pending" ? "Estamos a confirmar o seu pagamento" : "O pagamento não foi concluído";
  const message = confirmed
    ? d.message
    : p.state === "pending"
      ? "Assim que o processador confirmar o pagamento, esta página atualiza e o acesso ao produto fica disponível. Não feche esta página nem pague novamente."
      : "Nenhum valor foi cobrado por esta encomenda. Pode tentar novamente.";

  return (
    <div className={cn("w-full", p.fullPage ? "min-h-dvh" : "min-h-full")} style={{ background: d.backgroundColor, color: fg, fontFamily: FONT_STACKS[d.font] }} data-testid="thank-you" data-state={p.state} data-mode={dark ? "dark" : "light"}>
      <header className={cn("border-b", dark ? "border-white/10" : "border-black/10")}>
        <div className={cn("mx-auto flex h-16 max-w-3xl items-center px-5", center ? "justify-center" : "justify-start")}>
          {d.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.logoUrl} alt={p.businessName} className="h-8 max-w-[180px] object-contain" />
          ) : (
            <span className="text-[15px] font-semibold tracking-tight">{p.businessName}</span>
          )}
        </div>
      </header>

      <main className={cn("mx-auto flex max-w-xl flex-col px-5", SPACING[d.spacing], center ? "items-center text-center" : "items-start text-left")}>
        <span className="grid h-16 w-16 place-items-center rounded-full" style={{ background: confirmed ? `${d.primaryColor}22` : dark ? "rgb(255 255 255 / 0.06)" : "rgb(0 0 0 / 0.05)" }}>
          <Icon className="h-9 w-9" style={{ color: confirmed ? d.primaryColor : p.state === "failed" ? "#ef4444" : fg }} aria-hidden="true" />
        </span>

        {d.heroImageUrl && confirmed && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.heroImageUrl} alt="" className="w-full rounded-2xl object-cover" />
        )}

        <div>
          <h1 className={cn("font-semibold leading-tight tracking-tight", p.titleSize === "sm" ? "text-2xl sm:text-3xl" : p.titleSize === "lg" ? "text-4xl sm:text-5xl" : "text-3xl sm:text-4xl")} data-testid="thank-you-title">
            {title}
          </h1>
          {confirmed && d.subtitle && <p className={cn("mt-2 text-lg", muted)}>{d.subtitle}</p>}
          <p className={cn("mt-4 whitespace-pre-line text-[15.5px] leading-relaxed", muted)}>
            {confirmed && p.customerFirstName ? `${p.customerFirstName}, ${message.charAt(0).toLowerCase()}${message.slice(1)}` : message}
          </p>
        </div>

        {p.upsellNote && (
          <p className={cn("flex w-full gap-2 rounded-xl border px-4 py-3 text-left text-sm", dark ? "border-amber-400/30 bg-amber-400/10" : "border-amber-500/40 bg-amber-50")} role="status">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {p.upsellNote}
          </p>
        )}

        {confirmed && d.showSummary && p.items && p.items.length > 0 && (
          <div className={cn("w-full rounded-2xl border p-5 text-left", card)} data-testid="thank-you-summary">
            <p className={cn("text-[12px] font-semibold uppercase tracking-[0.12em]", muted)}>Resumo da compra{p.code ? ` · ${p.code}` : ""}</p>
            <ul className="mt-3 flex flex-col gap-2 text-[14.5px]">
              {p.items.map((i, k) => (
                <li key={k} className="flex justify-between gap-3">
                  <span>{i.description}</span>
                  <span className="shrink-0 tabular-nums">{formatMoney(i.totalCents, p.currency)}</span>
                </li>
              ))}
              {(p.upsells ?? [])
                .filter((u) => u.status === "APPROVED")
                .map((u, k) => (
                  <li key={`u${k}`} className="flex justify-between gap-3">
                    <span>{u.description}</span>
                    <span className="shrink-0 tabular-nums">{formatMoney(u.totalCents, p.currency)}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}

        {confirmed && d.instructions && (
          <div className={cn("w-full rounded-2xl border p-5 text-left", card)}>
            <p className={cn("text-[12px] font-semibold uppercase tracking-[0.12em]", muted)}>Próximos passos</p>
            <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed">{d.instructions}</p>
          </div>
        )}

        {(p.support || p.button) && confirmed && (
          <div className={cn("flex w-full flex-col gap-3", center ? "items-center" : "items-start")} data-testid="thank-you-actions">
            {p.support && (
              <a
                href={p.preview ? undefined : p.support.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={p.preview || undefined}
                className={cn("inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border px-6 py-3 text-[15px] font-semibold transition-colors sm:w-auto sm:min-w-72", dark ? "border-white/15 hover:bg-white/5" : "border-black/15 hover:bg-black/5")}
                data-testid="thank-you-whatsapp"
              >
                <MessageCircle className="h-4.5 w-4.5 text-[#25D366]" aria-hidden="true" /> {p.support.label}
              </a>
            )}
          </div>
        )}

        {p.button && (
          <div className={cn("flex w-full flex-col gap-2", center ? "items-center" : "items-start")}>
            {p.mainProductName && confirmed && (
              <p className={cn("text-[13.5px]", muted)} data-testid="thank-you-product-name">
                O seu produto: <strong className="font-semibold" style={{ color: fg }}>{p.mainProductName}</strong>
              </p>
            )}
            <a
              href={p.preview ? undefined : p.button.href}
              target={p.button.external ? "_blank" : undefined}
              rel={p.button.external ? "noopener noreferrer" : undefined}
              aria-disabled={p.preview || undefined}
              className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-xl px-6 py-3.5 text-[15.5px] font-semibold shadow-sm transition-[filter,transform] hover:brightness-105 active:translate-y-px sm:w-auto sm:min-w-72"
              style={{ background: d.primaryColor, color: onPrimary }}
              data-testid="thank-you-button"
            >
              <ButtonIcon className="h-4.5 w-4.5" aria-hidden="true" /> {p.button.label}
            </a>
            {d.helperText && <p className={cn("text-[13px]", muted)}>{d.helperText}</p>}
          </div>
        )}

        {confirmed && p.extraProducts && p.extraProducts.length > 0 && (
          <ul className="flex w-full flex-col gap-2 text-left" data-testid="thank-you-extra-products">
            {p.extraProducts.map((x, k) => (
              <li key={k} className={cn("flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between", card)}>
                <span className="min-w-0">
                  <span className={cn("block text-[11px] font-semibold uppercase tracking-[0.12em]", muted)}>{x.kind === "DOWNSELL" ? "Downsell" : x.kind === "UPSELL" ? "Upsell" : "Produto"}</span>
                  <span className="block font-medium">{x.name}</span>
                </span>
                <a
                  href={p.preview ? undefined : x.href}
                  target={x.external ? "_blank" : undefined}
                  rel={x.external ? "noopener noreferrer" : undefined}
                  className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold"
                  style={{ background: d.primaryColor, color: onPrimary }}
                  data-testid="thank-you-extra-access"
                >
                  {x.file ? <Download className="h-4 w-4" aria-hidden="true" /> : <ExternalLink className="h-4 w-4" aria-hidden="true" />} {x.label}
                </a>
              </li>
            ))}
          </ul>
        )}

        {confirmed && p.accessAreaHref && (
          <p className={cn("w-full rounded-xl border px-4 py-3 text-[13px] leading-relaxed", card, muted)} data-testid="thank-you-access-area">
            Guarde o seu acesso:{" "}
            <a href={p.preview ? undefined : p.accessAreaHref} className="font-semibold underline underline-offset-2" style={{ color: fg }}>
              Os meus produtos
            </a>{" "}
            — um link pessoal com todos os produtos desta compra. Perdeu-o? Recupere em <span className="font-mono">/acesso</span> com o email e o código da encomenda.
          </p>
        )}

        {!p.extraProducts && (p.upsells ?? []).filter((u) => u.accessHref).length > 0 && (
          <ul className="flex w-full flex-col gap-2">
            {p.upsells!.filter((u) => u.accessHref).map((u, k) => (
              <li key={k}>
                <a href={p.preview ? undefined : u.accessHref!} className={cn("flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium", card)}>
                  <span>Aceder: {u.description}</span> <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}

        {p.continueUrl && p.state === "confirmed" && (
          <a href={p.preview ? undefined : p.continueUrl} rel="noopener" className={cn("inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border px-6 py-3 text-[15px] font-semibold", card)} data-testid="thank-you-continue">
            Continuar <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        )}

        {p.state === "failed" && p.retryPath && (
          <a href={p.preview ? undefined : p.retryPath} className="inline-flex h-12 items-center justify-center rounded-xl px-6 font-semibold" style={{ background: d.primaryColor, color: onPrimary }}>
            Tentar novamente
          </a>
        )}

        {(d.supportText || p.supportEmail) && (
          <p className={cn("text-[13.5px]", muted)}>
            {d.supportText || "Precisa de ajuda?"}{" "}
            {p.supportEmail && (
              <a href={p.preview ? undefined : `mailto:${p.supportEmail}`} className="underline underline-offset-2">
                {p.supportEmail}
              </a>
            )}
          </p>
        )}
      </main>

      <footer className={cn("border-t", dark ? "border-white/10" : "border-black/10")}>
        <div className={cn("mx-auto max-w-3xl px-5 py-6 text-[12.5px]", muted, center ? "text-center" : "text-left")}>
          © {new Date().getFullYear()} {p.businessName}
          {p.code ? ` · Encomenda ${p.code}` : ""} · Pagamento processado com segurança
        </div>
      </footer>
    </div>
  );
}
