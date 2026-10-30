"use client";

import { isDark, readableOn } from "@/lib/color";
import type { CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PurchaseOutcome } from "@/server/services/purchase";
import { CONTENT_WIDTHS, FONT_FAMILIES, SECTION_LAYOUTS, defaultDesign, type CheckoutDesign, type DesignElement, type DesignSection } from "@/lib/checkout-design";
import { ElementContent, boxStyle, visibilityClass, type RenderCtx } from "./checkout-elements";
import { CheckBadge, PURCHASE_FORM_ID, PurchaseForm, whiteOn, type Palette } from "./purchase-form";
import { formatMoney } from "@/lib/money";

/** Opção de pagamento de um gateway ativo. id: "epay" (página alojada) ou "e2payments:mpesa" (direto). */
export interface CheckoutPaymentOption {
  id: string;
  providerId: string;
  providerName: string;
  label: string;
  requiresPhone: boolean;
  /** Pagamento numa página alojada pelo fornecedor (ex.: EPay) */
  hosted: { methodsLabel: string; isTest: boolean } | null;
}

export interface CheckoutViewData {
  publicId?: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  /** Banner promocional do produto (cartão do produto no checkout); sem banner usa-se a imagem principal */
  bannerUrl?: string | null;
  /** Tamanho real (px) da imagem do cartão do produto: mostrada inteira, sem cortes nem ampliação */
  cardImageSize?: { width: number; height: number } | null;
  /** false: o checkout não pede email (o produto identifica o comprador pelo telefone) */
  collectEmail?: boolean;
  buttonText: string;
  primaryColor: string;
  backgroundColor: string;
  collectPhone: boolean;
  requirePhone: boolean;
  collectDocument: boolean;
  requireDocument: boolean;
  allowCoupons: boolean;
  supportEmail: string | null;
  productName: string;
  offerName: string;
  priceCents: number;
  compareAtCents: number | null;
  currency: CurrencyCode;
  isDemo: boolean;
  businessName: string;
  /** Opções dos gateways ativos (EPay e/ou E2Payments). Vazio = sem métodos disponíveis. */
  paymentOptions?: CheckoutPaymentOption[];
  /** Dados reais para a prova social: compras pagas deste checkout nas últimas 24 h e visitas nos últimos 5 min */
  socialProof?: { purchases24h: number; viewersNow: number };
}

export interface ElementLocation {
  sectionId: string;
  col: number;
  index: number;
}

/**
 * Pontos de extensão usados SÓ pelo editor visual (arrastar, selecionar, indicadores).
 * O checkout público não os passa e, por isso, não carrega nenhum código do editor.
 */
export interface EditorHooks {
  section: (section: DesignSection, index: number, node: React.ReactNode) => React.ReactNode;
  column: (section: DesignSection, col: number, props: { className: string; style: React.CSSProperties; children: React.ReactNode; empty: boolean }) => React.ReactNode;
  element: (el: DesignElement, at: ElementLocation, node: React.ReactNode) => React.ReactNode;
}

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

export function CheckoutView({
  data: rawData,
  design: rawDesign,
  mode = "live",
  submitAction,
  couponAction,
  editor,
}: {
  data: CheckoutViewData;
  /** Personalização visual (secções e elementos). Nunca altera preço, moeda, formulário ou pagamento. */
  design?: CheckoutDesign | null;
  mode?: "live" | "preview";
  submitAction?: (input: Record<string, string>, sessionId?: string) => Promise<PurchaseOutcome>;
  couponAction?: (code: string) => Promise<{ ok: true; discountCents: number; totalCents: number; code: string } | { ok: false; message: string }>;
  editor?: EditorHooks;
}) {
  const design = rawDesign ?? defaultDesign(rawData);
  const data: CheckoutViewData = { ...rawData, primaryColor: design.theme.primaryColor, backgroundColor: design.theme.backgroundColor, buttonText: design.theme.buttonText };
  const dark = isDark(data.backgroundColor);
  // cores opcionais do tema (só valores completos #RRGGBB; enquanto se escreve no editor, usa-se a predefinição)
  const okHex = (v: string | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : "");
  const t = { textColor: okHex(design.theme.textColor), buttonColor: okHex(design.theme.buttonColor), countdownColor: okHex(design.theme.countdownColor) };
  // cores dos textos: as do utilizador ou automáticas conforme o fundo (sempre legíveis)
  const fgColor = t.textColor || (dark ? "#FFFFFF" : "#0A0B0D");
  const mutedColor = t.textColor ? `${t.textColor}B3` : dark ? "#FFFFFF99" : "#0000008C";
  const button = t.buttonColor || data.primaryColor;
  const p: Palette = {
    dark,
    fg: "text-[color:var(--ck-fg)]",
    muted: "text-[color:var(--ck-muted)]",
    panel: dark ? "bg-white/[0.04] border-white/10" : "bg-white border-black/10 shadow-sm",
    primary: data.primaryColor,
    onPrimary: readableOn(data.primaryColor),
    button,
    onButton: readableOn(button),
    countdown: t.countdownColor || "",
  };
  const editing = Boolean(editor);
  const ctx: RenderCtx = {
    data,
    p,
    editing,
    storageKey: data.publicId ?? "preview",
    checkout: (el) => (
      <PurchaseForm
        data={data}
        mode={editing ? "preview" : mode}
        title={el.title}
        subtitle={el.subtitle}
        p={p}
        submitAction={submitAction}
        couponAction={couponAction}
        variant={el.variant}
        card={{ phoneTitle: el.phoneTitle, phoneHint: el.phoneHint, phoneNote: el.phoneNote, securityItems: el.securityItems, consentText: el.consentText }}
      />
    ),
  };

  const renderElement = (el: DesignElement, at: ElementLocation) => {
    // avaliações sem conteúdo: nada no checkout público (no editor aparece o lembrete)
    if (!editor && el.type === "testimonials" && el.items.length === 0) return null;
    const node = (
      <div
        key={el.id}
        className={cn("min-w-0 empty:hidden", visibilityClass(el.style, editing), el.type === "checkout" && el.stickyDesktop && "@2xl:sticky @2xl:top-6")}
        // o cronómetro aplica a sua cor a todo o componente (não à caixa exterior)
        style={boxStyle(el.type === "countdown" ? { ...el.style, background: undefined, color: undefined } : el.style)}
        data-block={el.type}
        data-element-id={el.id}
      >
        <ElementContent el={el} ctx={ctx} />
      </div>
    );
    return editor ? <div key={el.id}>{editor.element(el, at, node)}</div> : node;
  };

  const renderSection = (s: DesignSection, index: number) => {
    const st = s.style;
    const cols = SECTION_LAYOUTS[s.layout].cols;
    const width = CONTENT_WIDTHS[st.contentWidth].px;
    const inner: Vars = {
      "--cols": cols.map((c) => `minmax(0, ${c}fr)`).join(" "),
      "--py": `${st.paddingY}px`,
      "--py-m": `${Math.min(st.paddingY, 32)}px`,
      maxWidth: width || undefined,
      paddingInline: st.paddingX,
      columnGap: st.gap,
      rowGap: Math.min(st.gap, 32),
    };
    const node = (
      <section
        key={s.id}
        className={cn("min-w-0", visibilityClass(st, editing))}
        style={{ background: st.background || undefined, borderRadius: st.radius || undefined, border: st.borderWidth ? `${st.borderWidth}px solid ${st.borderColor || "currentColor"}` : undefined }}
        data-section-id={s.id}
      >
        <div className="mx-auto grid grid-cols-1 py-[var(--py-m)] @2xl:py-[var(--py)] @2xl:[grid-template-columns:var(--cols)]" style={inner}>
          {s.columns.map((col, ci) => {
            const props = {
              className: "flex min-w-0 flex-col",
              style: { rowGap: st.rowGap, justifyContent: st.valign === "center" ? "center" : st.valign === "end" ? "flex-end" : "flex-start" } as React.CSSProperties,
              children: col.map((el, i) => renderElement(el, { sectionId: s.id, col: ci, index: i })),
              empty: col.length === 0,
            };
            return editor ? (
              <div key={ci} className="flex min-w-0 flex-col">
                {editor.column(s, ci, props)}
              </div>
            ) : (
              <div key={ci} className={props.className} style={props.style}>
                {props.children}
              </div>
            );
          })}
        </div>
      </section>
    );
    return editor ? <div key={s.id}>{editor.section(s, index, node)}</div> : node;
  };

  const rootStyle: Vars = {
    background: data.backgroundColor,
    "--ck-fg": fgColor,
    "--ck-muted": mutedColor,
    fontFamily: FONT_FAMILIES[design.theme.fontFamily].css,
    "--ck-heading": FONT_FAMILIES[design.theme.headingFont].css,
  };

  return (
    <div className={cn("@container min-h-full overflow-x-clip", p.fg)} style={rootStyle} data-testid="checkout-root" data-mode={dark ? "dark" : "light"}>
      {data.isDemo && <div className="bg-[#f5a524] px-4 py-2 text-center text-[12.5px] font-semibold text-black">CHECKOUT DE DEMONSTRAÇÃO — nenhuma cobrança é efetuada</div>}
      {mode === "preview" && !editing && <div className="bg-[#60a5fa] px-4 py-2 text-center text-[12.5px] font-semibold text-black">Pré-visualização — submissões desativadas</div>}
      {design.theme.announcement && (
        <div className="px-4 py-2.5 text-center text-[13px] font-semibold" style={{ background: data.primaryColor, color: p.onPrimary }} data-block="announcement">
          {design.theme.announcement}
        </div>
      )}
      <main className="flex flex-col">{design.sections.map(renderSection)}</main>
      {design.theme.stickyPayBar && <StickyPayBar amount={formatMoney(data.priceCents, data.currency)} color={button} onColor={whiteOn(button)} background={data.backgroundColor} editing={editing} />}
    </div>
  );
}

/**
 * Botão de pagamento fixo no fundo do ecrã (sticky: ocupa o seu próprio espaço no fim da página, por isso nunca tapa
 * campos nem provoca saltos). Respeita a zona segura do iPhone. Com os dados preenchidos submete o formulário real
 * (a mesma validação e o mesmo pagamento); caso contrário leva ao primeiro campo em falta.
 */
function StickyPayBar({ amount, color, onColor, background, editing }: { amount: string; color: string; onColor: string; background: string; editing: boolean }) {
  const go = () => {
    if (editing) return;
    const form = document.getElementById(PURCHASE_FORM_ID) as HTMLFormElement | null;
    if (!form) return;
    const missing = Array.from(form.querySelectorAll<HTMLInputElement>("input[required]")).find((i) => !i.value.trim());
    if (missing) {
      missing.scrollIntoView({ behavior: "smooth", block: "center" });
      missing.focus({ preventScroll: true });
      return;
    }
    form.requestSubmit();
  };
  return (
    <div
      className="sticky bottom-0 z-40 px-3.5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))]"
      style={{ background: `linear-gradient(to top, ${background} 55%, color-mix(in srgb, ${background} 0%, transparent))` }}
      data-testid="sticky-pay-bar"
    >
      <button
        type="button"
        onClick={go}
        className="mx-auto flex h-[52px] w-full max-w-[492px] items-center justify-center gap-2 rounded-[14px] text-[16px] font-extrabold transition-[filter,transform] hover:brightness-105 active:translate-y-px"
        style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${color} 78%, white), ${color})`, color: onColor, boxShadow: `0 10px 24px -10px ${color}` }}
        aria-label={`Ir para o pagamento — ${amount}`}
      >
        <CheckBadge />
        <span className="tabular">{amount}</span>
      </button>
    </div>
  );
}
