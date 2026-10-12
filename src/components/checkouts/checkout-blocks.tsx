"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Clock, ShieldCheck, Star, Check } from "lucide-react";
import { videoEmbedUrl, type DesignBlock } from "@/lib/checkout-design";
import { cn } from "@/lib/utils";

interface Palette {
  dark: boolean;
  muted: string;
  panel: string;
  primary: string;
}

/** Contagem decrescente apenas visual — nunca altera o preço nem a disponibilidade da compra. */
function Countdown({ block, storageKey, p }: { block: Extract<DesignBlock, { type: "countdown" }>; storageKey: string; p: Palette }) {
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    if (block.mode === "fixed") {
      const t = Date.parse(block.endsAt);
      setEnd(Number.isFinite(t) ? t : null);
    } else {
      const key = `ntp:cd:${storageKey}:${block.id}:${block.minutes}`;
      let start = Date.now();
      try {
        const saved = Number(localStorage.getItem(key));
        if (saved && saved <= Date.now()) start = saved;
        else localStorage.setItem(key, String(start));
      } catch {}
      setEnd(start + block.minutes * 60_000);
    }
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [block.mode, block.endsAt, block.minutes, block.id, storageKey]);

  const left = end === null ? null : Math.max(0, end - now);
  const parts = left === null ? null : [Math.floor(left / 86_400_000), Math.floor(left / 3_600_000) % 24, Math.floor(left / 60_000) % 60, Math.floor(left / 1000) % 60];
  return (
    <div className={cn("rounded-2xl border p-4 text-center", p.panel)} data-block="countdown">
      <p className="flex items-center justify-center gap-2 text-sm font-semibold">
        <Clock className="h-4 w-4" aria-hidden="true" style={{ color: p.primary }} />
        {block.title}
      </p>
      {left === 0 || parts === null ? (
        <p className={cn("mt-2 text-sm", p.muted)}>{block.expiredText}</p>
      ) : (
        <div className="mt-3 flex justify-center gap-2" aria-live="off">
          {(parts[0] > 0 ? parts : parts.slice(1)).map((v, i, arr) => (
            <div key={i} className={cn("min-w-14 rounded-xl px-2 py-2", p.dark ? "bg-white/[0.06]" : "bg-black/[0.04]")}>
              <span className="block font-display text-2xl font-semibold tabular">{String(v).padStart(2, "0")}</span>
              <span className={cn("text-[10.5px] uppercase tracking-wider", p.muted)}>{(arr.length === 4 ? ["dias", "horas", "min", "seg"] : ["horas", "min", "seg"])[i]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Faq({ block, p }: { block: Extract<DesignBlock, { type: "faq" }>; p: Palette }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div data-block="faq">
      {block.title && <h2 className="mb-3 font-display text-lg font-semibold">{block.title}</h2>}
      <ul className={cn("divide-y rounded-2xl border", p.panel, p.dark ? "divide-white/10" : "divide-black/10")}>
        {block.items.map((it, i) => (
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

/** Desenha um bloco do design. O cabeçalho do produto é fornecido pelo checkout (dados reais do servidor). */
export function CheckoutBlock({ block, productHeader, p, storageKey, selected }: { block: DesignBlock; productHeader: React.ReactNode; p: Palette; storageKey: string; selected?: boolean }) {
  const wrap = (node: React.ReactNode) => (selected === undefined ? node : <div className={cn("rounded-2xl outline-offset-4 transition-[outline]", selected && "outline-2 outline-dashed")} style={selected ? { outlineColor: p.primary } : undefined}>{node}</div>);
  switch (block.type) {
    case "product":
      return wrap(productHeader);
    case "banner":
      return wrap(
        block.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={block.imageUrl} alt={block.alt} className={cn("w-full object-cover", block.rounded && "rounded-2xl")} data-block="banner" />
        ) : (
          <div className={cn("grid aspect-[3/1] place-items-center rounded-2xl border border-dashed text-sm", p.panel, p.muted)}>Banner sem imagem</div>
        ),
      );
    case "text":
      return wrap(
        <div className={cn(block.align === "center" && "text-center")} data-block="text">
          {block.title && <h2 className="font-display text-xl font-semibold leading-snug">{block.title}</h2>}
          {block.body && <p className={cn("mt-2 whitespace-pre-line text-[15px] leading-relaxed", p.muted)}>{block.body}</p>}
        </div>,
      );
    case "video": {
      const src = block.url ? videoEmbedUrl(block.url) : null;
      return wrap(
        <figure data-block="video">
          {src ? (
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe src={src} title={block.caption || "Vídeo"} className="h-full w-full" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          ) : (
            <div className={cn("grid aspect-video place-items-center rounded-2xl border border-dashed text-sm", p.panel, p.muted)}>Adicione um link do YouTube ou Vimeo</div>
          )}
          {block.caption && <figcaption className={cn("mt-2 text-center text-[13px]", p.muted)}>{block.caption}</figcaption>}
        </figure>,
      );
    }
    case "testimonials":
      return wrap(
        <div data-block="testimonials">
          {block.title && <h2 className="mb-3 font-display text-lg font-semibold">{block.title}</h2>}
          <ul className="grid gap-3 @lg:grid-cols-2">
            {block.items.map((t, i) => (
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
                    <img src={t.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
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
        </div>,
      );
    case "countdown":
      return wrap(<Countdown block={block} storageKey={storageKey} p={p} />);
    case "benefits":
      return wrap(
        <div data-block="benefits">
          {block.title && <h2 className="mb-3 font-display text-lg font-semibold">{block.title}</h2>}
          <ul className="flex flex-col gap-2.5">
            {block.items.map((b, i) => (
              <li key={i} className="flex gap-2.5 text-[15px]">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full" style={{ background: p.primary }}>
                  <Check className="h-3 w-3" aria-hidden="true" style={{ color: p.dark ? "#0a0b0d" : "#fff" }} />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>,
      );
    case "guarantee":
      return wrap(
        <div className={cn("flex gap-4 rounded-2xl border p-4", p.panel)} data-block="guarantee">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full border-2" style={{ borderColor: p.primary }}>
            {block.days > 0 ? (
              <span className="text-center leading-none">
                <span className="block font-display text-lg font-semibold">{block.days}</span>
                <span className="text-[9px] uppercase">dias</span>
              </span>
            ) : (
              <ShieldCheck className="h-6 w-6" style={{ color: p.primary }} aria-hidden="true" />
            )}
          </div>
          <div>
            <p className="font-semibold">{block.title}</p>
            {block.body && <p className={cn("mt-1 whitespace-pre-line text-[14px] leading-relaxed", p.muted)}>{block.body}</p>}
          </div>
        </div>,
      );
    case "faq":
      return wrap(<Faq block={block} p={p} />);
    case "image":
      return wrap(
        <figure data-block="image">
          {block.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.imageUrl} alt={block.alt} className="w-full rounded-2xl object-cover" />
          ) : (
            <div className={cn("grid aspect-video place-items-center rounded-2xl border border-dashed text-sm", p.panel, p.muted)}>Imagem sem endereço</div>
          )}
          {block.caption && <figcaption className={cn("mt-2 text-center text-[13px]", p.muted)}>{block.caption}</figcaption>}
        </figure>,
      );
    case "divider":
      return wrap(<hr className={cn("border-t", p.dark ? "border-white/10" : "border-black/10")} />);
  }
}
