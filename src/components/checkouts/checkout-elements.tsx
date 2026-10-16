"use client";

import { ResponsiveImg } from "@/components/public/responsive-img";
import { useEffect, useState } from "react";
import { Award, Check, ChevronDown, Clock, Download, Gift, Heart, Info, Lock, Phone, ShieldCheck, Star, Truck, type LucideIcon } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { readableOn } from "@/lib/color";
import { cn } from "@/lib/utils";
import { FONT_FAMILIES, videoEmbedUrl, type DesignElement, type ElementStyle, type ICONS } from "@/lib/checkout-design";
import type { CheckoutViewData } from "./checkout-view";
import { PURCHASE_FORM_ID, type Palette } from "./purchase-form";

export const ICON_MAP: Record<(typeof ICONS)[number], LucideIcon> = { check: Check, shield: ShieldCheck, lock: Lock, star: Star, clock: Clock, gift: Gift, truck: Truck, download: Download, phone: Phone, heart: Heart, award: Award, info: Info };

export interface RenderCtx {
  data: CheckoutViewData;
  p: Palette;
  /** No editor: elementos ocultos num dispositivo ficam visíveis (esbatidos) para poderem ser selecionados. */
  editing: boolean;
  storageKey: string;
  checkout: (el: Extract<DesignElement, { type: "checkout" }>) => React.ReactNode;
}

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

/** Estilos validados → estilo inline (sem CSS livre: só propriedades e valores controlados). */
export function boxStyle(s: ElementStyle): Vars {
  const st: Vars = {};
  if (s.marginTop !== undefined) st.marginTop = s.marginTop;
  if (s.marginBottom !== undefined) st.marginBottom = s.marginBottom;
  if (s.paddingY !== undefined || s.paddingX !== undefined) st.padding = `${s.paddingY ?? 0}px ${s.paddingX ?? 0}px`;
  if (s.maxWidth) {
    st.maxWidth = s.maxWidth;
    st.width = "100%";
    if (s.align === "center") st.marginInline = "auto";
    if (s.align === "right") st.marginLeft = "auto";
  }
  if (s.background) st.background = s.background;
  if (s.radius !== undefined) st.borderRadius = s.radius;
  if (s.borderWidth) st.border = `${s.borderWidth}px solid ${s.borderColor ?? "currentColor"}`;
  if (s.color) st.color = s.color;
  if (s.fontFamily && s.fontFamily !== "inherit") st.fontFamily = FONT_FAMILIES[s.fontFamily].css;
  if (s.fontWeight) st.fontWeight = s.fontWeight;
  if (s.lineHeight) st.lineHeight = s.lineHeight;
  if (s.letterSpacing !== undefined) st.letterSpacing = `${s.letterSpacing}px`;
  if (s.align) st.textAlign = s.align;
  if (s.fontSize) {
    st["--fs"] = `${s.fontSize}px`;
    st["--fs-m"] = `${s.fontSizeMobile ?? Math.max(Math.min(s.fontSize, 16), Math.round(s.fontSize * 0.8))}px`;
  }
  return st;
}

/** Visibilidade por dispositivo (consultas de contentor: a pré-visualização do editor reage à largura escolhida). */
export function visibilityClass(s: { hideDesktop?: boolean; hideMobile?: boolean }, editing: boolean) {
  if (editing) return cn(s.hideMobile && "@max-2xl:opacity-40", s.hideDesktop && "@2xl:opacity-40");
  return cn(s.hideMobile && "@max-2xl:hidden", s.hideDesktop && "@2xl:hidden");
}

/** Tamanho de letra: o do utilizador (com versão para telemóvel) ou a predefinição do elemento. */
function fs(s: ElementStyle, fallback: string) {
  return s.fontSize ? "text-[length:var(--fs-m)] @2xl:text-[length:var(--fs)]" : fallback;
}

const COUNTDOWN_SIZES = {
  sm: { num: "text-xl @md:text-2xl", unit: "text-[10px]", box: "py-1.5", title: "text-[13px]" },
  md: { num: "text-2xl @md:text-3xl", unit: "text-[10.5px]", box: "py-2", title: "text-sm" },
  lg: { num: "text-3xl @md:text-[42px]", unit: "text-[11.5px]", box: "py-2.5", title: "text-base" },
} as const;

/**
 * Cronómetro (só visual: não altera o preço nem bloqueia a compra). A cor escolhida preenche TODO o
 * componente — fundo, área dos números e das unidades —, com números e textos brancos (ou escuros, se a
 * cor for muito clara) para continuarem legíveis. A cor nunca afeta outros elementos da página.
 */
function Countdown({ el, storageKey, p }: { el: Extract<DesignElement, { type: "countdown" }>; storageKey: string; p: Palette }) {
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (el.mode === "fixed") {
      const t = Date.parse(el.endsAt);
      setEnd(Number.isFinite(t) ? t : 0);
    } else {
      const key = `ntp:cd:${storageKey}:${el.id}:${el.minutes}`;
      let start = Date.now();
      try {
        const saved = Number(localStorage.getItem(key));
        if (saved && saved <= Date.now()) start = saved;
        else localStorage.setItem(key, String(start));
      } catch {}
      setEnd(start + el.minutes * 60_000);
    }
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [el.mode, el.endsAt, el.minutes, el.id, storageKey]);
  const left = end === null ? null : Math.max(0, end - now);
  const parts = left === null ? null : [Math.floor(left / 86_400_000), Math.floor(left / 3_600_000) % 24, Math.floor(left / 60_000) % 60, Math.floor(left / 1000) % 60];
  // cor do próprio cronómetro → cor do tema para cronómetros → (designs antigos) fundo do elemento → cor principal
  const ok = (v: string | undefined) => (v && /^#[0-9a-f]{6}$/i.test(v) ? v : "");
  const bg = ok(el.bgColor) || p.countdown || ok(el.style.background) || p.primary;
  const fg = ok(el.textColor) || ok(el.style.color) || (readableOn(bg) === "#ffffff" ? "#FFFFFF" : "#0A0B0D");
  const sz = COUNTDOWN_SIZES[el.size ?? "md"];
  // antes do primeiro cálculo (HTML do servidor), "--" no lugar dos números — nunca o texto de "terminado"
  const shown: (number | null)[] = parts ? (parts[0] > 0 ? parts : parts.slice(1)) : [null, null, null];
  return (
    <div className="@container w-full overflow-hidden rounded-2xl px-3 py-3.5 text-center @sm:px-4" style={{ background: bg, color: fg }} data-testid="countdown" data-bg={bg}>
      {el.title && (
        <p className={cn("flex items-center justify-center gap-2 font-semibold [overflow-wrap:anywhere]", sz.title)}>
          <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {el.title}
        </p>
      )}
      {left === 0 ? (
        <p className="mt-2 text-sm opacity-90">{el.expiredText}</p>
      ) : (
        <div className={cn("mx-auto grid max-w-md gap-1.5 @sm:gap-2", el.title && "mt-2.5")} style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }} aria-live="off">
          {shown.map((v, i, arr) => (
            // as áreas internas usam a mesma cor (ligeiramente realçada), nunca branco/transparente
            <div key={i} className={cn("min-w-0 rounded-xl px-1", sz.box)} style={{ background: `color-mix(in srgb, ${fg} 14%, ${bg})` }} data-testid="countdown-unit">
              <span className={cn("block font-display font-semibold leading-none tabular", sz.num)}>{v === null ? "--" : String(v).padStart(2, "0")}</span>
              <span className={cn("mt-1 block truncate uppercase tracking-wider opacity-90", sz.unit)}>{(arr.length === 4 ? ["dias", "horas", "min", "seg"] : ["horas", "min", "seg"])[i]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Faq({ el, p }: { el: Extract<DesignElement, { type: "faq" }>; p: Palette }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div>
      {el.title && <h2 className="mb-3 font-[family-name:var(--ck-heading)] text-lg font-semibold">{el.title}</h2>}
      <ul className={cn("divide-y rounded-2xl border", p.panel, p.dark ? "divide-white/10" : "divide-black/10")}>
        {el.items.map((it, i) => (
          <li key={i}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left text-[15px] font-medium" aria-expanded={open === i}>
              {it.q}
              <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", open === i && "rotate-180")} aria-hidden="true" />
            </button>
            {open === i && <p className={cn("whitespace-pre-line px-4 pb-4 text-[14px] leading-relaxed", p.muted)}>{it.a}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

const ASPECT: Record<string, string | undefined> = { auto: undefined, "1/1": "1 / 1", "4/3": "4 / 3", "3/2": "3 / 2", "16/9": "16 / 9", "21/9": "21 / 9", "3/1": "3 / 1", "3/4": "3 / 4" };

function Placeholder({ ctx, label, aspect = "16 / 9" }: { ctx: RenderCtx; label: string; aspect?: string }) {
  return (
    <div className={cn("grid w-full place-items-center rounded-2xl border border-dashed px-4 text-center text-sm", ctx.p.panel, ctx.p.muted)} style={{ aspectRatio: aspect }}>
      {label}
    </div>
  );
}

function scrollToForm(e: React.MouseEvent<HTMLAnchorElement>) {
  const form = document.getElementById(PURCHASE_FORM_ID);
  if (!form) return;
  e.preventDefault();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  (form.querySelector("input") as HTMLInputElement | null)?.focus({ preventScroll: true });
}

/** Conteúdo de um elemento (sem a caixa exterior). Os dados comerciais vêm sempre de `ctx.data` (servidor). */
export function ElementContent({ el, ctx }: { el: DesignElement; ctx: RenderCtx }) {
  const { data, p } = ctx;
  const s = el.style;
  switch (el.type) {
    case "heading": {
      const Tag = el.level;
      const txt = el.source === "productName" ? data.title : el.text;
      const size = el.level === "h1" ? "text-[28px] @2xl:text-[38px]" : el.level === "h2" ? "text-[22px] @2xl:text-[28px]" : "text-[18px] @2xl:text-[21px]";
      return <Tag className={cn("font-[family-name:var(--ck-heading)] font-semibold leading-[1.15] tracking-tight [overflow-wrap:anywhere]", fs(s, size))}>{txt}</Tag>;
    }
    case "subtitle":
      return <p className={cn("leading-snug [overflow-wrap:anywhere]", !s.color && (p.dark ? "text-white/80" : "text-black/75"), fs(s, "text-[17px] @2xl:text-[19px]"))}>{el.text}</p>;
    case "text": {
      const txt = el.source === "productDescription" ? (data.description ?? "") : el.text;
      if (!txt && !ctx.editing) return null;
      return <p className={cn("whitespace-pre-line leading-relaxed [overflow-wrap:anywhere]", !s.color && p.muted, fs(s, "text-[15px] @2xl:text-[16px]"))}>{txt || "Sem descrição do produto."}</p>;
    }
    case "image": {
      const src = el.source === "product" ? data.imageUrl : el.src;
      const aspect = ASPECT[el.aspect];
      const vars: Vars = { "--w": `${el.widthPct}%`, "--wm": `${el.mobileWidthPct}%` };
      if (el.maxWidthPx) vars.maxWidth = el.maxWidthPx;
      const media = src ? (
        <ResponsiveImg
          src={src}
          alt={el.source === "product" ? el.alt || data.productName : el.alt}
          loading={el.source === "product" ? "eager" : "lazy"}
          fetchPriority={el.source === "product" ? "high" : undefined}
          decoding="async"
          className="block h-auto w-full max-w-full"
          style={{ aspectRatio: aspect, height: !aspect && el.heightPx ? el.heightPx : undefined, objectFit: aspect || el.heightPx ? el.fit : undefined, objectPosition: `${el.focusX}% ${el.focusY}%`, borderRadius: el.imgRadius }}
        />
      ) : el.source === "product" && ctx.editing ? (
        <div className={cn("grid w-full place-items-center border", p.panel)} style={{ aspectRatio: aspect ?? "16 / 10", borderRadius: el.imgRadius }} aria-hidden="true">
          <span className="font-display text-5xl font-semibold" style={{ color: p.primary }}>
            {initials(data.productName)}
          </span>
        </div>
      ) : ctx.editing ? (
        <Placeholder ctx={ctx} label="Escolha uma imagem no painel de propriedades" aspect={aspect} />
      ) : null;
      if (!media) return null;
      return (
        <figure className={cn("flex flex-col", el.imgAlign === "left" ? "items-start" : el.imgAlign === "right" ? "items-end" : "items-center")}>
          <div className="w-[var(--wm)] max-w-full @2xl:w-[var(--w)]" style={vars}>
            {media}
            {el.caption && <figcaption className={cn("mt-2 text-center text-[13px]", p.muted)}>{el.caption}</figcaption>}
          </div>
        </figure>
      );
    }
    case "banner": {
      if (!el.src && !ctx.editing) return null;
      return (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: el.aspect.replace("/", " / "), borderRadius: el.imgRadius }}>
          {el.src ? (
            <ResponsiveImg src={el.src} alt={el.alt} decoding="async" sizes="(max-width: 1080px) 100vw, 1080px" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: `${el.focusX}% ${el.focusY}%` }} />
          ) : (
            <div className={cn("absolute inset-0 grid place-items-center border border-dashed text-sm", p.panel, p.muted)}>Escolha uma imagem para o banner</div>
          )}
          {(el.title || el.subtitle) && (
            <>
              {el.overlay > 0 && <div className="absolute inset-0 bg-black" style={{ opacity: el.overlay / 100 }} aria-hidden="true" />}
              <div className="relative flex h-full flex-col items-center justify-center px-5 text-center" style={{ color: el.textColor }}>
                {el.title && <p className={cn("font-[family-name:var(--ck-heading)] font-semibold leading-tight", fs(s, "text-[22px] @2xl:text-[34px]"))}>{el.title}</p>}
                {el.subtitle && <p className="mt-2 max-w-xl text-[14px] opacity-90 @2xl:text-[16px]">{el.subtitle}</p>}
              </div>
            </>
          )}
        </div>
      );
    }
    case "video": {
      const src = el.url ? videoEmbedUrl(el.url) : null;
      if (!src && !ctx.editing) return null;
      return (
        <figure>
          {src ? (
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe src={src} title={el.caption || "Vídeo"} className={cn("h-full w-full", ctx.editing && "pointer-events-none")} allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          ) : (
            <Placeholder ctx={ctx} label="Adicione um link do YouTube ou Vimeo" />
          )}
          {el.caption && <figcaption className={cn("mt-2 text-center text-[13px]", p.muted)}>{el.caption}</figcaption>}
        </figure>
      );
    }
    case "benefits": {
      const Icon = ICON_MAP[el.icon];
      return (
        <div>
          {el.title && <h2 className={cn("mb-3 font-[family-name:var(--ck-heading)] font-semibold", fs(s, "text-lg"))}>{el.title}</h2>}
          <ul className="flex flex-col gap-2.5">
            {el.items.map((b, i) => (
              <li key={i} className="flex gap-2.5 text-[15px] leading-snug">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: p.primary }}>
                  <Icon className="h-3 w-3" aria-hidden="true" style={{ color: p.onPrimary }} />
                </span>
                <span className="min-w-0 [overflow-wrap:anywhere]">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "testimonials":
      return (
        <div>
          {el.title && <h2 className={cn("mb-3 font-[family-name:var(--ck-heading)] font-semibold", fs(s, "text-lg"))}>{el.title}</h2>}
          <ul className="grid gap-3 @lg:grid-cols-2">
            {el.items.map((t, i) => (
              <li key={i} className={cn("rounded-2xl border p-4", p.panel)}>
                {t.rating > 0 && (
                  <div className="mb-2 flex gap-0.5" aria-label={`${t.rating} de 5 estrelas`}>
                    {Array.from({ length: 5 }, (_, k) => (
                      <Star key={k} className="h-3.5 w-3.5" fill={k < t.rating ? p.primary : "transparent"} stroke={k < t.rating ? p.primary : "currentColor"} aria-hidden="true" />
                    ))}
                  </div>
                )}
                <p className="whitespace-pre-line text-[14px] leading-relaxed">“{t.text}”</p>
                <div className="mt-3 flex items-center gap-2.5">
                  {t.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.avatarUrl} alt="" loading="lazy" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <span className={cn("grid h-8 w-8 place-items-center rounded-full text-[12px] font-semibold", p.dark ? "bg-white/10" : "bg-black/10")} aria-hidden="true">
                      {t.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <span className="text-[13px]">
                    <span className="block font-semibold">{t.name}</span>
                    {t.role && <span className={cn("block", p.muted)}>{t.role}</span>}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      );
    case "guarantee":
      return (
        <div className={cn("flex gap-4 rounded-2xl border p-4", p.panel)}>
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: p.primary }}>
            {el.days > 0 ? (
              <span className="text-center leading-none">
                <span className="block font-display text-lg font-semibold">{el.days}</span>
                <span className="text-[9px] uppercase">dias</span>
              </span>
            ) : (
              <ShieldCheck className="h-6 w-6" style={{ color: p.primary }} aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="font-semibold">{el.title}</p>
            {el.body && <p className={cn("mt-1 whitespace-pre-line text-[14px] leading-relaxed", p.muted)}>{el.body}</p>}
          </div>
        </div>
      );
    case "faq":
      return <Faq el={el} p={p} />;
    case "countdown":
      return <Countdown el={el} storageKey={ctx.storageKey} p={p} />;
    case "infoBox": {
      const Icon = ICON_MAP[el.icon];
      return (
        <div className={cn("flex gap-3.5 rounded-2xl border p-4", p.panel, el.layout === "column" && "flex-col items-center text-center")}>
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: `${p.primary}22`, color: p.primary }}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            {el.title && <p className="font-semibold">{el.title}</p>}
            {el.body && <p className={cn("mt-1 whitespace-pre-line text-[14px] leading-relaxed", p.muted)}>{el.body}</p>}
          </div>
        </div>
      );
    }
    case "trust":
      if (!el.items.length) return null;
      return (
        <ul className={cn("flex gap-x-5 gap-y-2.5 text-[13px] font-medium", el.layout === "row" ? "flex-wrap justify-center" : "flex-col")}>
          {el.items.map((t, i) => {
            const Icon = ICON_MAP[t.icon];
            return (
              <li key={i} className="flex items-center gap-2">
                <Icon className="h-4 w-4 shrink-0" style={{ color: p.primary }} aria-hidden="true" />
                {t.text}
              </li>
            );
          })}
        </ul>
      );
    case "productSummary":
      return (
        <div className={cn("flex gap-4 rounded-2xl border p-4", p.panel)}>
          {el.showImage &&
            (data.imageUrl ? (
              <ResponsiveImg src={data.imageUrl} alt="" loading="lazy" sizes="80px" maxWidth={160} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
            ) : (
              <span className={cn("grid h-20 w-20 shrink-0 place-items-center rounded-xl border font-display text-xl font-semibold", p.panel)} style={{ color: p.primary }} aria-hidden="true">
                {initials(data.productName)}
              </span>
            ))}
          <div className="min-w-0">
            <p className="font-semibold leading-snug">{data.productName}</p>
            <p className={cn("text-[13px]", p.muted)}>{data.offerName}</p>
            {el.showDescription && data.description && <p className={cn("mt-1.5 line-clamp-3 text-[13.5px] leading-relaxed", p.muted)}>{data.description}</p>}
            <p className="mt-1.5 font-display text-lg font-semibold tabular">{formatMoney(data.priceCents, data.currency)}</p>
          </div>
        </div>
      );
    case "price":
      return (
        <div data-testid="price">
          {el.label && <p className={cn("mb-1 text-[13px] font-medium uppercase tracking-wider", p.muted)}>{el.label}</p>}
          <div className={cn("flex flex-wrap items-baseline gap-3", s.align === "center" && "justify-center", s.align === "right" && "justify-end")}>
            <span className={cn("font-display font-semibold tabular", fs(s, "text-3xl"))}>{formatMoney(data.priceCents, data.currency)}</span>
            {el.showCompareAt && data.compareAtCents && <span className={cn("text-lg line-through tabular", p.muted)}>{formatMoney(data.compareAtCents, data.currency)}</span>}
          </div>
        </div>
      );
    case "button": {
      const size = el.size === "sm" ? "h-10 px-4 text-[14px]" : el.size === "lg" ? "h-14 px-7 text-[17px]" : "h-12 px-6 text-[15px]";
      const style = el.variant === "solid" ? { background: p.button, color: p.onButton } : { border: `2px solid ${p.button}`, color: p.button };
      const cls = cn("inline-flex items-center justify-center rounded-xl font-semibold transition-[filter,transform] hover:brightness-105 active:translate-y-px", size, el.fullWidth && "w-full");
      const wrap = cn("flex", s.align === "center" ? "justify-center" : s.align === "right" ? "justify-end" : "justify-start");
      const onEditClick = (e: React.MouseEvent) => e.preventDefault();
      return (
        <div className={wrap}>
          {el.action === "link" && el.url ? (
            <a href={el.url} target="_blank" rel="noopener noreferrer nofollow" className={cls} style={style} onClick={ctx.editing ? onEditClick : undefined}>
              {el.label}
            </a>
          ) : (
            <a href={`#${PURCHASE_FORM_ID}`} className={cls} style={style} onClick={ctx.editing ? onEditClick : scrollToForm}>
              {el.label}
            </a>
          )}
        </div>
      );
    }
    case "spacer":
      return <div aria-hidden="true" className="h-[var(--hm)] @2xl:h-[var(--h)]" style={{ "--h": `${el.height}px`, "--hm": `${el.mobileHeight}px` } as Vars} />;
    case "divider":
      return <hr className="mx-auto" style={{ width: `${el.widthPct}%`, borderTopWidth: el.thickness, borderTopStyle: el.line, borderColor: el.lineColor || (p.dark ? "rgb(255 255 255 / 0.12)" : "rgb(0 0 0 / 0.12)") }} />;
    case "checkout":
      return ctx.checkout(el);
  }
}
