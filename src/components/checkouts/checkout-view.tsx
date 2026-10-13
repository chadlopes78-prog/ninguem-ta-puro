"use client";

import { isDark, readableOn } from "@/lib/color";
import type { CurrencyCode } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { PurchaseOutcome } from "@/server/services/purchase";
import { CONTENT_WIDTHS, FONT_FAMILIES, SECTION_LAYOUTS, defaultDesign, type CheckoutDesign, type DesignElement, type DesignSection } from "@/lib/checkout-design";
import { ElementContent, boxStyle, visibilityClass, type RenderCtx } from "./checkout-elements";
import { PurchaseForm, type Palette } from "./purchase-form";

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
  const p: Palette = {
    dark,
    fg: dark ? "text-white" : "text-[#0a0b0d]",
    muted: dark ? "text-white/60" : "text-black/55",
    panel: dark ? "bg-white/[0.04] border-white/10" : "bg-white border-black/10 shadow-sm",
    primary: data.primaryColor,
    onPrimary: readableOn(data.primaryColor),
  };
  const editing = Boolean(editor);
  const ctx: RenderCtx = {
    data,
    p,
    editing,
    storageKey: data.publicId ?? "preview",
    checkout: (el) => (
      <PurchaseForm data={data} mode={editing ? "preview" : mode} title={el.title} subtitle={el.subtitle} p={p} submitAction={submitAction} couponAction={couponAction} />
    ),
  };

  const renderElement = (el: DesignElement, at: ElementLocation) => {
    const node = (
      <div
        key={el.id}
        className={cn("min-w-0", visibilityClass(el.style, editing), el.type === "checkout" && el.stickyDesktop && "@2xl:sticky @2xl:top-6")}
        style={boxStyle(el.style)}
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
    </div>
  );
}
