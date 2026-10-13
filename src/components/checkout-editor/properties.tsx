"use client";

import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, ImageIcon, Lock, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CHECKOUT_THEME_PRESETS,
  CONTENT_WIDTHS,
  ELEMENT_INFO,
  FONT_FAMILIES,
  ICONS,
  SECTION_LAYOUTS,
  themeMode,
  type CheckoutDesign,
  type CheckoutTheme,
  type DesignElement,
  type DesignSection,
  type ElementStyle,
  type FontFamily,
  type SectionLayout,
} from "@/lib/checkout-design";
import { ColorProp, Group, ListProp, NumberProp, Prop, Segmented, SelectProp, TextProp, Toggle } from "./controls";
import { MediaPicker } from "./media-picker";
import { Input } from "@/components/ui/field";

type Patch = (patch: Partial<DesignElement>) => void;

const ALIGN = [
  { value: "left" as const, label: "Esquerda", icon: <AlignLeft className="h-3.5 w-3.5" /> },
  { value: "center" as const, label: "Centro", icon: <AlignCenter className="h-3.5 w-3.5" /> },
  { value: "right" as const, label: "Direita", icon: <AlignRight className="h-3.5 w-3.5" /> },
];
const ICON_LABELS: Record<(typeof ICONS)[number], string> = { check: "Visto", shield: "Escudo", lock: "Cadeado", star: "Estrela", clock: "Relógio", gift: "Presente", truck: "Entrega", download: "Download", phone: "Telefone", heart: "Coração", award: "Prémio", info: "Informação" };
const iconOptions = ICONS.map((i) => ({ value: i, label: ICON_LABELS[i] }));
const TEXTUAL = new Set(["heading", "subtitle", "text", "price", "benefits", "testimonials", "faq", "guarantee", "infoBox", "trust", "banner", "button", "countdown", "productSummary"]);

function ImageField({ src, onChange }: { src: string; onChange: (src: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[12.5px] font-medium text-fg/85">Imagem</span>
      <button type="button" onClick={() => setOpen(true)} className="group relative grid aspect-video w-full place-items-center overflow-hidden rounded-[var(--radius-md)] border border-dashed border-line bg-surface-2 text-[12.5px] text-muted hover:border-accent/50" data-testid="choose-image">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1.5">
            <ImageIcon className="h-5 w-5" /> Escolher imagem
          </span>
        )}
        {src && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-1.5 text-center text-[12px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">Substituir imagem</span>}
      </button>
      {src && (
        <button type="button" onClick={() => onChange("")} className="flex items-center gap-1.5 self-start text-[12px] text-muted hover:text-danger">
          <Trash2 className="h-3.5 w-3.5" /> Remover imagem
        </button>
      )}
      <MediaPicker open={open} onClose={() => setOpen(false)} onPick={onChange} current={src} />
    </div>
  );
}

/** Conteúdo específico de cada tipo de elemento. */
function ContentFields({ el, set }: { el: DesignElement; set: Patch }) {
  switch (el.type) {
    case "heading":
      return (
        <>
          <Segmented label="Texto" value={el.source} onChange={(source) => set({ source })} options={[{ value: "productName", label: "Nome do produto" }, { value: "custom", label: "Personalizado" }]} />
          {el.source === "custom" ? <TextProp label="Título" value={el.text} onChange={(text) => set({ text })} max={200} area rows={2} /> : <p className="text-[12px] text-subtle">Mostra sempre o nome atual do produto.</p>}
          <Segmented label="Nível" value={el.level} onChange={(level) => set({ level })} options={[{ value: "h1", label: "H1" }, { value: "h2", label: "H2" }, { value: "h3", label: "H3" }]} />
        </>
      );
    case "subtitle":
      return <TextProp label="Subtítulo" value={el.text} onChange={(text) => set({ text })} max={400} area rows={3} />;
    case "text":
      return (
        <>
          <Segmented label="Texto" value={el.source} onChange={(source) => set({ source })} options={[{ value: "productDescription", label: "Descrição do produto" }, { value: "custom", label: "Personalizado" }]} />
          {el.source === "custom" ? <TextProp label="Texto" value={el.text} onChange={(text) => set({ text })} max={5000} area rows={6} /> : <p className="text-[12px] text-subtle">Mostra sempre a descrição atual do produto.</p>}
        </>
      );
    case "image":
      return (
        <>
          <Segmented label="Origem" value={el.source} onChange={(source) => set({ source })} options={[{ value: "product", label: "Imagem do produto" }, { value: "custom", label: "Outra imagem" }]} />
          {el.source === "custom" && <ImageField src={el.src} onChange={(src) => set({ src })} />}
          <TextProp label="Texto alternativo (acessibilidade)" value={el.alt} onChange={(alt) => set({ alt })} max={160} placeholder="Descreva a imagem" />
          <TextProp label="Legenda" value={el.caption} onChange={(caption) => set({ caption })} max={200} />
          <NumberProp label="Largura (computador)" value={el.widthPct} onChange={(v) => set({ widthPct: v ?? 100 })} min={10} max={100} unit="%" />
          <NumberProp label="Largura (telemóvel)" value={el.mobileWidthPct} onChange={(v) => set({ mobileWidthPct: v ?? 100 })} min={10} max={100} unit="%" />
          <NumberProp label="Largura máxima" value={el.maxWidthPx || undefined} onChange={(v) => set({ maxWidthPx: v ?? 0 })} min={40} max={2400} step={10} optional />
          <SelectProp label="Proporção" value={el.aspect} onChange={(aspect) => set({ aspect })} options={[{ value: "auto", label: "Original" }, { value: "1/1", label: "Quadrada 1:1" }, { value: "4/3", label: "4:3" }, { value: "3/2", label: "3:2" }, { value: "16/9", label: "16:9" }, { value: "21/9", label: "21:9 (panorâmica)" }, { value: "3/1", label: "3:1 (faixa)" }, { value: "3/4", label: "3:4 (vertical)" }]} />
          {el.aspect === "auto" && <NumberProp label="Altura fixa" value={el.heightPx || undefined} onChange={(v) => set({ heightPx: v ?? 0 })} min={40} max={1200} step={10} optional />}
          <Segmented label="Enquadramento" value={el.fit} onChange={(fit) => set({ fit })} options={[{ value: "cover", label: "Preencher" }, { value: "contain", label: "Mostrar toda" }]} />
          <NumberProp label="Ponto focal horizontal" value={el.focusX} onChange={(v) => set({ focusX: v ?? 50 })} min={0} max={100} unit="%" />
          <NumberProp label="Ponto focal vertical" value={el.focusY} onChange={(v) => set({ focusY: v ?? 50 })} min={0} max={100} unit="%" />
          <NumberProp label="Cantos arredondados" value={el.imgRadius} onChange={(v) => set({ imgRadius: v ?? 0 })} min={0} max={48} />
          <Segmented label="Alinhamento" value={el.imgAlign} onChange={(imgAlign) => set({ imgAlign })} options={ALIGN} />
        </>
      );
    case "banner":
      return (
        <>
          <ImageField src={el.src} onChange={(src) => set({ src })} />
          <TextProp label="Texto alternativo" value={el.alt} onChange={(alt) => set({ alt })} max={160} />
          <TextProp label="Título sobre a imagem" value={el.title} onChange={(title) => set({ title })} max={160} />
          <TextProp label="Subtítulo sobre a imagem" value={el.subtitle} onChange={(subtitle) => set({ subtitle })} max={300} area rows={2} />
          <SelectProp label="Proporção" value={el.aspect} onChange={(aspect) => set({ aspect })} options={[{ value: "3/1", label: "3:1 (faixa)" }, { value: "21/9", label: "21:9" }, { value: "16/9", label: "16:9" }, { value: "4/3", label: "4:3" }]} />
          <NumberProp label="Escurecer imagem" value={el.overlay} onChange={(v) => set({ overlay: v ?? 0 })} min={0} max={85} unit="%" />
          <ColorProp label="Cor do texto" value={el.textColor} onChange={(v) => set({ textColor: v ?? "#FFFFFF" })} optional={false} />
          <NumberProp label="Ponto focal horizontal" value={el.focusX} onChange={(v) => set({ focusX: v ?? 50 })} min={0} max={100} unit="%" />
          <NumberProp label="Ponto focal vertical" value={el.focusY} onChange={(v) => set({ focusY: v ?? 50 })} min={0} max={100} unit="%" />
          <NumberProp label="Cantos arredondados" value={el.imgRadius} onChange={(v) => set({ imgRadius: v ?? 0 })} min={0} max={48} />
        </>
      );
    case "video":
      return (
        <>
          <TextProp label="Link do vídeo (YouTube ou Vimeo)" value={el.url} onChange={(url) => set({ url })} max={2000} placeholder="https://www.youtube.com/watch?v=…" />
          <TextProp label="Legenda" value={el.caption} onChange={(caption) => set({ caption })} max={160} />
        </>
      );
    case "benefits":
      return (
        <>
          <TextProp label="Título" value={el.title} onChange={(title) => set({ title })} max={160} />
          <SelectProp label="Ícone" value={el.icon} onChange={(icon) => set({ icon })} options={iconOptions} />
          <ListProp items={el.items} max={24} addLabel="Adicionar benefício" empty="Novo benefício" onChange={(items) => set({ items })} render={(it, s) => <Input aria-label="Benefício" value={it} maxLength={240} onChange={(e) => s(e.target.value)} className="h-9" />} />
        </>
      );
    case "testimonials":
      return (
        <>
          <TextProp label="Título" value={el.title} onChange={(title) => set({ title })} max={160} />
          <ListProp
            items={el.items}
            max={12}
            addLabel="Adicionar testemunho"
            empty={{ name: "Nome", text: "Testemunho", role: "", avatarUrl: "", rating: 5 }}
            onChange={(items) => set({ items })}
            render={(it, s) => (
              <>
                <TextProp label="Nome" value={it.name} onChange={(name) => s({ ...it, name })} max={80} />
                <TextProp label="Testemunho" value={it.text} onChange={(text) => s({ ...it, text })} max={700} area rows={3} />
                <TextProp label="Profissão/cidade (opcional)" value={it.role} onChange={(role) => s({ ...it, role })} max={80} />
                <SelectProp label="Estrelas" value={String(it.rating)} onChange={(v) => s({ ...it, rating: Number(v) })} options={["5", "4", "3", "2", "1", "0"].map((n) => ({ value: n, label: n === "0" ? "Sem estrelas" : `${n} estrela${n === "1" ? "" : "s"}` }))} />
              </>
            )}
          />
          <p className="text-[11.5px] text-subtle">Use apenas testemunhos reais de clientes.</p>
        </>
      );
    case "guarantee":
      return (
        <>
          <TextProp label="Título" value={el.title} onChange={(title) => set({ title })} max={160} />
          <TextProp label="Texto" value={el.body} onChange={(body) => set({ body })} max={1200} area />
          <NumberProp label="Dias (0 = mostrar escudo)" value={el.days} onChange={(v) => set({ days: v ?? 0 })} min={0} max={365} unit="d" />
        </>
      );
    case "faq":
      return (
        <>
          <TextProp label="Título" value={el.title} onChange={(title) => set({ title })} max={160} />
          <ListProp
            items={el.items}
            max={24}
            addLabel="Adicionar pergunta"
            empty={{ q: "Pergunta", a: "Resposta" }}
            onChange={(items) => set({ items })}
            render={(it, s) => (
              <>
                <TextProp label="Pergunta" value={it.q} onChange={(q) => s({ ...it, q })} max={240} />
                <TextProp label="Resposta" value={it.a} onChange={(a) => s({ ...it, a })} max={1200} area rows={3} />
              </>
            )}
          />
        </>
      );
    case "countdown":
      return (
        <>
          <TextProp label="Título" value={el.title} onChange={(title) => set({ title })} max={160} />
          <Segmented label="Tipo" value={el.mode} onChange={(mode) => set({ mode })} options={[{ value: "evergreen", label: "Por visita" }, { value: "fixed", label: "Data fixa" }]} />
          {el.mode === "evergreen" ? (
            <NumberProp label="Minutos" value={el.minutes} onChange={(v) => set({ minutes: v ?? 15 })} min={1} max={10080} unit="min" />
          ) : (
            <Prop label="Termina em">{(id) => <Input id={id} type="datetime-local" value={el.endsAt ? new Date(el.endsAt).toISOString().slice(0, 16) : ""} onChange={(e) => set({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : "" })} className="h-9" />}</Prop>
          )}
          <TextProp label="Texto quando termina" value={el.expiredText} onChange={(expiredText) => set({ expiredText })} max={200} />
          <p className="text-[11.5px] text-subtle">O cronómetro é apenas visual: não altera o preço nem bloqueia a compra.</p>
        </>
      );
    case "infoBox":
      return (
        <>
          <SelectProp label="Ícone" value={el.icon} onChange={(icon) => set({ icon })} options={iconOptions} />
          <TextProp label="Título" value={el.title} onChange={(title) => set({ title })} max={160} />
          <TextProp label="Texto" value={el.body} onChange={(body) => set({ body })} max={1200} area />
          <Segmented label="Disposição" value={el.layout} onChange={(layout) => set({ layout })} options={[{ value: "row", label: "Ícone ao lado" }, { value: "column", label: "Ícone em cima" }]} />
        </>
      );
    case "trust":
      return (
        <>
          <Segmented label="Disposição" value={el.layout} onChange={(layout) => set({ layout })} options={[{ value: "row", label: "Em linha" }, { value: "column", label: "Em lista" }]} />
          <ListProp
            items={el.items}
            max={8}
            addLabel="Adicionar selo"
            empty={{ icon: "check" as const, text: "Novo selo" }}
            onChange={(items) => set({ items })}
            render={(it, s) => (
              <>
                <SelectProp label="Ícone" value={it.icon} onChange={(icon) => s({ ...it, icon })} options={iconOptions} />
                <TextProp label="Texto" value={it.text} onChange={(text) => s({ ...it, text })} max={80} />
              </>
            )}
          />
          <p className="text-[11.5px] text-subtle">Escreva apenas afirmações verdadeiras sobre a sua oferta.</p>
        </>
      );
    case "productSummary":
      return (
        <>
          <p className="text-[12px] text-subtle">Mostra o nome, a oferta e o preço reais do produto.</p>
          <Toggle label="Mostrar imagem" checked={el.showImage} onChange={(showImage) => set({ showImage })} />
          <Toggle label="Mostrar descrição" checked={el.showDescription} onChange={(showDescription) => set({ showDescription })} />
        </>
      );
    case "price":
      return (
        <>
          <p className="text-[12px] text-subtle">O valor e a moeda vêm sempre da oferta do produto e não podem ser alterados aqui.</p>
          <TextProp label="Rótulo (opcional)" value={el.label} onChange={(label) => set({ label })} max={60} placeholder="Ex.: Preço de lançamento" />
          <Toggle label="Mostrar preço anterior riscado" checked={el.showCompareAt} onChange={(showCompareAt) => set({ showCompareAt })} />
        </>
      );
    case "button":
      return (
        <>
          <TextProp label="Texto do botão" value={el.label} onChange={(label) => set({ label })} max={60} />
          <Segmented label="Ao clicar" value={el.action} onChange={(action) => set({ action })} options={[{ value: "scrollToCheckout", label: "Ir para o formulário" }, { value: "link", label: "Abrir link" }]} />
          {el.action === "link" && <TextProp label="Link (https://)" value={el.url} onChange={(url) => set({ url })} max={2000} placeholder="https://" />}
          <Segmented label="Tamanho" value={el.size} onChange={(size) => set({ size })} options={[{ value: "sm", label: "Pequeno" }, { value: "md", label: "Médio" }, { value: "lg", label: "Grande" }]} />
          <Segmented label="Estilo" value={el.variant} onChange={(variant) => set({ variant })} options={[{ value: "solid", label: "Preenchido" }, { value: "outline", label: "Contorno" }]} />
          <Toggle label="Largura total" checked={el.fullWidth} onChange={(fullWidth) => set({ fullWidth })} />
          <p className="text-[11.5px] text-subtle">Este botão não efetua compras: leva ao formulário de compra real ou abre um link.</p>
        </>
      );
    case "spacer":
      return (
        <>
          <NumberProp label="Altura (computador)" value={el.height} onChange={(v) => set({ height: v ?? 32 })} min={4} max={240} />
          <NumberProp label="Altura (telemóvel)" value={el.mobileHeight} onChange={(v) => set({ mobileHeight: v ?? 24 })} min={0} max={240} />
        </>
      );
    case "divider":
      return (
        <>
          <NumberProp label="Espessura" value={el.thickness} onChange={(v) => set({ thickness: v ?? 1 })} min={1} max={8} />
          <NumberProp label="Largura" value={el.widthPct} onChange={(v) => set({ widthPct: v ?? 100 })} min={5} max={100} unit="%" />
          <Segmented label="Linha" value={el.line} onChange={(line) => set({ line })} options={[{ value: "solid", label: "Contínua" }, { value: "dashed", label: "Tracejada" }, { value: "dotted", label: "Pontilhada" }]} />
          <ColorProp label="Cor da linha" value={el.lineColor || undefined} onChange={(v) => set({ lineColor: v ?? "" })} />
        </>
      );
    case "checkout":
      return (
        <>
          <p className="flex gap-2 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Componente protegido: campos obrigatórios, validação, cupões, métodos de pagamento (EPay/E2Payments), resumo e confirmação funcionam sempre como antes. Pode mudar a posição, o título e o aspeto exterior.
          </p>
          <TextProp label="Título do formulário" value={el.title} onChange={(title) => set({ title })} max={80} />
          <TextProp label="Texto de apoio" value={el.subtitle} onChange={(subtitle) => set({ subtitle })} max={200} />
          <Toggle label="Fixo ao deslocar (computador)" checked={el.stickyDesktop} onChange={(stickyDesktop) => set({ stickyDesktop })} />
        </>
      );
  }
}

function StyleFields({ el, s, set }: { el: DesignElement; s: ElementStyle; set: (p: Partial<ElementStyle>) => void }) {
  const textual = TEXTUAL.has(el.type);
  return (
    <>
      {textual && (
        <Group title="Tipografia">
          <SelectProp
            label="Tipo de letra"
            value={s.fontFamily ?? "inherit"}
            onChange={(v) => set({ fontFamily: v === "inherit" ? undefined : v })}
            options={(Object.keys(FONT_FAMILIES) as FontFamily[]).map((k) => ({ value: k, label: FONT_FAMILIES[k].label }))}
          />
          <NumberProp label="Tamanho (computador)" value={s.fontSize} onChange={(fontSize) => set({ fontSize })} min={10} max={96} optional />
          <NumberProp label="Tamanho (telemóvel)" value={s.fontSizeMobile} onChange={(fontSizeMobile) => set({ fontSizeMobile })} min={10} max={72} optional />
          <SelectProp
            label="Peso"
            value={String(s.fontWeight ?? "")}
            onChange={(v) => set({ fontWeight: v ? (Number(v) as ElementStyle["fontWeight"]) : undefined })}
            options={[{ value: "", label: "Predefinido" }, { value: "300", label: "Leve" }, { value: "400", label: "Normal" }, { value: "500", label: "Médio" }, { value: "600", label: "Semi-negrito" }, { value: "700", label: "Negrito" }, { value: "800", label: "Extra-negrito" }]}
          />
          <ColorProp label="Cor do texto" value={s.color} onChange={(color) => set({ color })} />
          <Segmented label="Alinhamento" value={s.align} onChange={(align) => set({ align })} options={ALIGN} />
          <NumberProp label="Altura da linha" value={s.lineHeight} onChange={(lineHeight) => set({ lineHeight })} min={0.9} max={2.6} step={0.05} unit="×" optional fallback={1.5} />
          <NumberProp label="Espaçamento entre letras" value={s.letterSpacing} onChange={(letterSpacing) => set({ letterSpacing })} min={-3} max={12} step={0.1} optional fallback={0} />
        </Group>
      )}
      <Group title="Fundo e contorno">
        <ColorProp label="Cor de fundo" value={s.background} onChange={(background) => set({ background })} />
        <NumberProp label="Cantos arredondados" value={s.radius} onChange={(radius) => set({ radius })} min={0} max={48} optional fallback={0} />
        <NumberProp label="Espessura do contorno" value={s.borderWidth} onChange={(borderWidth) => set({ borderWidth })} min={0} max={8} optional fallback={0} />
        {!!s.borderWidth && <ColorProp label="Cor do contorno" value={s.borderColor} onChange={(borderColor) => set({ borderColor })} />}
      </Group>
    </>
  );
}

function AdvancedFields({ el, s, set }: { el: DesignElement; s: ElementStyle; set: (p: Partial<ElementStyle>) => void }) {
  const protectedEl = el.type === "checkout";
  return (
    <>
      <Group title="Espaçamento">
        <NumberProp label="Margem superior" value={s.marginTop} onChange={(marginTop) => set({ marginTop })} min={0} max={240} optional fallback={0} />
        <NumberProp label="Margem inferior" value={s.marginBottom} onChange={(marginBottom) => set({ marginBottom })} min={0} max={240} optional fallback={0} />
        <NumberProp label="Espaço interno vertical" value={s.paddingY} onChange={(paddingY) => set({ paddingY })} min={0} max={160} optional fallback={0} />
        <NumberProp label="Espaço interno horizontal" value={s.paddingX} onChange={(paddingX) => set({ paddingX })} min={0} max={160} optional fallback={0} />
        <NumberProp label="Largura máxima" value={s.maxWidth || undefined} onChange={(maxWidth) => set({ maxWidth })} min={80} max={1600} step={10} optional />
      </Group>
      <Group title="Visibilidade">
        <Toggle label="Ocultar no computador" checked={!!s.hideDesktop} disabled={protectedEl} onChange={(v) => set({ hideDesktop: v || undefined })} />
        <Toggle label="Ocultar no telemóvel" checked={!!s.hideMobile} disabled={protectedEl} onChange={(v) => set({ hideMobile: v || undefined })} hint={protectedEl ? "O formulário de compra está sempre visível." : "No editor, os elementos ocultos aparecem esbatidos."} />
      </Group>
    </>
  );
}

export function ElementProperties({ el, onChange, onStyle }: { el: DesignElement; onChange: Patch; onStyle: (p: Partial<ElementStyle>) => void }) {
  const [tab, setTab] = useState<"content" | "style" | "advanced">("content");
  return (
    <div data-testid="element-properties">
      <div className="sticky top-0 z-10 border-b border-line bg-surface">
        <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-accent">{ELEMENT_INFO[el.type].label}</p>
        <div className="mt-2 grid grid-cols-3" role="tablist">
          {(
            [
              ["content", "Conteúdo"],
              ["style", "Estilo"],
              ["advanced", "Avançado"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("h-9 text-[12.5px] font-medium", tab === k ? "border-b-2 border-accent text-fg" : "text-muted hover:text-fg")}>
              {l}
            </button>
          ))}
        </div>
      </div>
      {tab === "content" && (
        <div className="flex flex-col gap-3.5 p-4">
          <ContentFields el={el} set={onChange} />
        </div>
      )}
      {tab === "style" && <StyleFields el={el} s={el.style} set={onStyle} />}
      {tab === "advanced" && <AdvancedFields el={el} s={el.style} set={onStyle} />}
    </div>
  );
}

function LayoutIcon({ layout }: { layout: SectionLayout }) {
  return (
    <span className="flex h-5 w-full gap-0.5">
      {SECTION_LAYOUTS[layout].cols.map((c, i) => (
        <span key={i} className="rounded-[2px] bg-current opacity-60" style={{ flex: c }} />
      ))}
    </span>
  );
}

export function SectionProperties({ section, onLayout, onStyle, hasCheckout }: { section: DesignSection; onLayout: (l: SectionLayout) => void; onStyle: (p: Partial<DesignSection["style"]>) => void; hasCheckout: boolean }) {
  const st = section.style;
  return (
    <div data-testid="section-properties">
      <p className="border-b border-line px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-accent">Secção</p>
      <Group title="Estrutura">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-fg/85">Colunas</span>
          <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Colunas">
            {(Object.keys(SECTION_LAYOUTS) as SectionLayout[]).map((l) => (
              <button key={l} type="button" role="radio" aria-checked={section.layout === l} title={SECTION_LAYOUTS[l].label} onClick={() => onLayout(l)} className={cn("rounded-[var(--radius-sm,6px)] border p-1.5 text-muted", section.layout === l ? "border-accent text-accent" : "border-line hover:border-line-strong")} data-testid={`layout-${l}`}>
                <LayoutIcon layout={l} />
                <span className="sr-only">{SECTION_LAYOUTS[l].label}</span>
              </button>
            ))}
          </div>
          <p className="text-[11.5px] text-subtle">No telemóvel, as colunas ficam umas por baixo das outras. Ao reduzir colunas, nada se perde.</p>
        </div>
        <SelectProp label="Largura do conteúdo" value={st.contentWidth} onChange={(contentWidth) => onStyle({ contentWidth })} options={Object.entries(CONTENT_WIDTHS).map(([k, v]) => ({ value: k as keyof typeof CONTENT_WIDTHS, label: v.label }))} />
        <Segmented label="Alinhamento vertical" value={st.valign} onChange={(valign) => onStyle({ valign })} options={[{ value: "start", label: "Topo" }, { value: "center", label: "Centro" }, { value: "end", label: "Base" }]} />
        <NumberProp label="Espaço entre colunas" value={st.gap} onChange={(v) => onStyle({ gap: v ?? 40 })} min={0} max={96} />
        <NumberProp label="Espaço entre elementos" value={st.rowGap} onChange={(v) => onStyle({ rowGap: v ?? 20 })} min={0} max={96} />
      </Group>
      <Group title="Espaçamento">
        <NumberProp label="Espaço interno vertical" value={st.paddingY} onChange={(v) => onStyle({ paddingY: v ?? 40 })} min={0} max={200} />
        <NumberProp label="Espaço interno horizontal" value={st.paddingX} onChange={(v) => onStyle({ paddingX: v ?? 16 })} min={0} max={120} />
      </Group>
      <Group title="Fundo e contorno">
        <ColorProp label="Cor de fundo" value={st.background || undefined} onChange={(v) => onStyle({ background: v ?? "" })} />
        <NumberProp label="Cantos arredondados" value={st.radius} onChange={(v) => onStyle({ radius: v ?? 0 })} min={0} max={48} />
        <NumberProp label="Espessura do contorno" value={st.borderWidth} onChange={(v) => onStyle({ borderWidth: v ?? 0 })} min={0} max={8} />
        {st.borderWidth > 0 && <ColorProp label="Cor do contorno" value={st.borderColor || undefined} onChange={(v) => onStyle({ borderColor: v ?? "" })} />}
      </Group>
      <Group title="Visibilidade">
        <Toggle label="Ocultar no computador" checked={st.hideDesktop} disabled={hasCheckout} onChange={(hideDesktop) => onStyle({ hideDesktop })} />
        <Toggle label="Ocultar no telemóvel" checked={st.hideMobile} disabled={hasCheckout} onChange={(hideMobile) => onStyle({ hideMobile })} hint={hasCheckout ? "Esta secção contém o formulário de compra e fica sempre visível." : undefined} />
      </Group>
    </div>
  );
}

export function PageProperties({ design, onTheme }: { design: CheckoutDesign; onTheme: (t: Partial<CheckoutTheme>) => void }) {
  const t = design.theme;
  const mode = themeMode(t);
  const pick = (m: "dark" | "light") => {
    const other = CHECKOUT_THEME_PRESETS[m === "dark" ? "light" : "dark"];
    // muda o fundo; a cor principal só muda se ainda for a predefinição do outro tema (mantém personalizações)
    onTheme({ mode: m, backgroundColor: CHECKOUT_THEME_PRESETS[m].backgroundColor, ...(t.primaryColor.toUpperCase() === other.primaryColor ? { primaryColor: CHECKOUT_THEME_PRESETS[m].primaryColor } : {}) });
  };
  const fontOptions = (Object.keys(FONT_FAMILIES) as FontFamily[]).filter((k) => k !== "inherit").map((k) => ({ value: k as Exclude<FontFamily, "inherit">, label: FONT_FAMILIES[k].label }));
  return (
    <div data-testid="page-properties">
      <p className="border-b border-line px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-accent">Página</p>
      <Group title="Tema">
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tema do checkout">
          {(["dark", "light"] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => pick(m)} data-testid={`checkout-theme-${m}`} className={cn("overflow-hidden rounded-[var(--radius-md)] border text-left transition-colors", mode === m ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-line-strong")}>
              <span className="block p-2.5" style={{ background: CHECKOUT_THEME_PRESETS[m].backgroundColor }}>
                <span className="block h-2 w-14 rounded" style={{ background: m === "dark" ? "#eceef1" : "#111316" }} />
                <span className="mt-1.5 block h-1.5 w-20 rounded opacity-50" style={{ background: m === "dark" ? "#eceef1" : "#111316" }} />
                <span className="mt-2.5 block h-4 rounded" style={{ background: CHECKOUT_THEME_PRESETS[m].primaryColor }} />
              </span>
              <span className="flex items-center justify-between px-2.5 py-2 text-[12.5px] font-medium">
                {m === "dark" ? "Negrito / Escuro" : "Claro"}
                {mode === m && <span className="text-accent">✓</span>}
              </span>
            </button>
          ))}
        </div>
        <ColorProp label="Cor principal (botões e destaques)" value={t.primaryColor} onChange={(v) => v && /^#[0-9A-F]{6}$/i.test(v) && onTheme({ primaryColor: v })} optional={false} />
        <ColorProp label="Cor de fundo da página" value={t.backgroundColor} onChange={(v) => v && /^#[0-9A-F]{6}$/i.test(v) && onTheme({ backgroundColor: v })} optional={false} />
      </Group>
      <Group title="Tipografia">
        <SelectProp label="Texto" value={t.fontFamily} onChange={(fontFamily) => onTheme({ fontFamily })} options={fontOptions} />
        <SelectProp label="Títulos" value={t.headingFont} onChange={(headingFont) => onTheme({ headingFont })} options={fontOptions} />
      </Group>
      <Group title="Compra">
        <TextProp label="Texto do botão de compra" value={t.buttonText} onChange={(buttonText) => onTheme({ buttonText })} max={40} />
        <TextProp label="Faixa de anúncio no topo (opcional)" value={t.announcement} onChange={(announcement) => onTheme({ announcement })} max={160} placeholder="Ex.: Oferta de lançamento" />
      </Group>
      <p className="m-4 flex gap-2 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />O preço, a moeda, o formulário de compra e os pagamentos (EPay/E2Payments) não são editáveis aqui: vêm sempre do produto e do servidor.
      </p>
    </div>
  );
}

