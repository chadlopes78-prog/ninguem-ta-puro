"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, Eye, Lock, Plus, RotateCcw, Save, Send, Trash2, X } from "lucide-react";
import { ADDABLE_BLOCKS, BLOCK_LABELS, newBlock, type CheckoutDesign, type DesignBlock } from "@/lib/checkout-design";
import { CHECKOUT_THEME_PRESETS, themeMode } from "@/lib/checkout-design";
import type { ActionResult, FieldErrors } from "@/server/validation/common";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { CheckoutView, type CheckoutViewData } from "./checkout-view";

type Status = "default" | "published" | "unpublished_changes";

interface Props {
  productId: string;
  productName: string;
  initial: CheckoutDesign;
  status: Status;
  hasPublished: boolean;
  previewData: CheckoutViewData;
  saveAction: (design: unknown) => Promise<ActionResult<{ fieldErrors?: FieldErrors }>>;
  publishAction: (design: unknown) => Promise<ActionResult<unknown>>;
  discardAction: () => Promise<ActionResult<unknown>>;
}

const STATUS_BADGE: Record<Status, React.ReactNode> = {
  default: <Badge>Modelo padrão</Badge>,
  published: <Badge tone="success" dot>Publicado</Badge>,
  unpublished_changes: <Badge tone="warning">Alterações por publicar</Badge>,
};

export function DesignEditor(props: Props) {
  const [design, setDesign] = useState<CheckoutDesign>(props.initial);
  const [saved, setSaved] = useState<string>(JSON.stringify(props.initial));
  const [selected, setSelected] = useState<string | null>(props.initial.blocks[0]?.id ?? null);
  const [tab, setTab] = useState<"elements" | "theme">("elements");
  const [view, setView] = useState<"edit" | "preview">("edit");
  const [adding, setAdding] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const dirty = JSON.stringify(design) !== saved;

  const block = design.blocks.find((b) => b.id === selected) ?? null;
  const update = (id: string, patch: Partial<DesignBlock>) =>
    setDesign((d) => ({ ...d, blocks: d.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as DesignBlock) : b)) }));
  const move = (id: string, dir: -1 | 1) =>
    setDesign((d) => {
      const i = d.blocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.blocks.length) return d;
      const blocks = [...d.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...d, blocks };
    });
  const remove = (id: string) => {
    setDesign((d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== id || b.type === "product") }));
    setSelected(null);
  };
  const add = (type: (typeof ADDABLE_BLOCKS)[number]) => {
    const b = newBlock(type);
    setDesign((d) => {
      const i = selected ? d.blocks.findIndex((x) => x.id === selected) : d.blocks.length - 1;
      const blocks = [...d.blocks];
      blocks.splice(i + 1, 0, b);
      return { ...d, blocks };
    });
    setSelected(b.id);
    setAdding(false);
    setTab("elements");
  };

  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) {
          setErrors({});
          toast(r.message ?? "Guardado.");
          after?.();
          router.refresh();
        } else {
          setErrors(r.fieldErrors ?? {});
          toast(r.error, "error");
        }
      } catch {
        toast("Erro de rede. As alterações continuam no editor — tente novamente.", "error");
      }
    });

  const saveDraft = () => run(() => props.saveAction(design), () => setSaved(JSON.stringify(design)));
  const publish = () => run(() => props.publishAction(design), () => setSaved(JSON.stringify(design)));
  const discard = () =>
    run(props.discardAction, () => {
      window.location.reload();
    });

  const preview = useMemo(() => <CheckoutView data={props.previewData} design={design} selectedBlockId={view === "edit" ? selected : undefined} mode="preview" />, [props.previewData, design, selected, view]);
  const blockErrors = Object.entries(errors).filter(([k]) => k.startsWith("blocks") || k.startsWith("theme"));

  return (
    <div className="-mx-4 -my-6 flex min-h-[calc(100dvh-3.5rem)] flex-col sm:-mx-6 lg:-mx-8 lg:-my-8 lg:h-dvh lg:min-h-0">
      {/* Barra superior */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        <Link href="/checkouts" className="grid h-9 w-9 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label="Voltar a Personalizar Checkout">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-subtle">Personalizar checkout</p>
          <p className="flex flex-wrap items-center gap-2 truncate font-display text-[15px] font-semibold">
            {props.productName} {STATUS_BADGE[props.status]}
            {dirty && <span className="text-[12px] font-normal text-warning">Alterações por guardar</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href={`/checkouts/personalizar/${props.productId}/preview`} target="_blank" rel="noopener" className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-line bg-surface-3 px-3 text-[13px] font-medium hover:bg-surface-hover" title="Abre o rascunho guardado">
            <Eye className="h-4 w-4" /> Pré-visualizar
          </a>
          {props.status !== "default" && (
            <Button variant="ghost" size="sm" onClick={discard} disabled={pending} title="Volta à versão publicada">
              <RotateCcw className="h-4 w-4" /> Descartar
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={saveDraft} loading={pending} data-testid="save-draft">
            <Save className="h-4 w-4" /> Guardar rascunho
          </Button>
          <Button size="sm" onClick={publish} loading={pending} data-testid="publish">
            <Send className="h-4 w-4" /> Publicar
          </Button>
        </div>
      </div>

      {/* Alternância edição/pré-visualização em ecrãs pequenos */}
      <div className="flex border-b border-line lg:hidden" role="tablist">
        {(["edit", "preview"] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("h-11 flex-1 text-[13px] font-medium", view === v ? "border-b-2 border-accent text-fg" : "text-muted")}>
            {v === "edit" ? "Editar" : "Pré-visualizar"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className={cn("flex min-h-0 flex-col border-line bg-surface lg:w-[380px] lg:shrink-0 lg:border-r", view === "preview" && "hidden lg:flex")} aria-label="Editor">
          <div className="flex border-b border-line" role="tablist">
            {(["elements", "theme"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cn("h-11 flex-1 text-[13px] font-medium", tab === t ? "border-b-2 border-accent text-fg" : "text-muted hover:text-fg")}>
                {t === "elements" ? "Elementos" : "Tema e cores"}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            {blockErrors.length > 0 && (
              <ul className="mb-4 flex flex-col gap-1 rounded-[var(--radius-md)] border border-danger/30 bg-danger/[0.06] p-3 text-[12.5px] text-danger" role="alert">
                {blockErrors.map(([k, v]) => (
                  <li key={k}>{v}</li>
                ))}
              </ul>
            )}
            {tab === "theme" ? (
              <ThemePanel design={design} onChange={(theme) => setDesign((d) => ({ ...d, theme: { ...d.theme, ...theme } }))} />
            ) : (
              <>
                <ol className="flex flex-col gap-1.5" data-testid="blocks-list">
                  {design.blocks.map((b, i) => (
                    <li key={b.id}>
                      <div className={cn("flex items-center gap-1 rounded-[var(--radius-md)] border px-2 py-1.5", selected === b.id ? "border-accent/50 bg-accent-soft" : "border-line hover:border-line-strong")}>
                        <button onClick={() => setSelected(b.id)} className="min-w-0 flex-1 truncate py-1 text-left text-[13px] font-medium" aria-pressed={selected === b.id}>
                          {BLOCK_LABELS[b.type].label}
                          {b.type === "product" && <Lock className="ml-1.5 inline h-3 w-3 text-subtle" aria-label="Elemento obrigatório" />}
                        </button>
                        <button onClick={() => move(b.id, -1)} disabled={i === 0} className="grid h-8 w-8 place-items-center rounded text-subtle hover:text-fg disabled:opacity-30" aria-label={`Subir ${BLOCK_LABELS[b.type].label}`}>
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => move(b.id, 1)} disabled={i === design.blocks.length - 1} className="grid h-8 w-8 place-items-center rounded text-subtle hover:text-fg disabled:opacity-30" aria-label={`Descer ${BLOCK_LABELS[b.type].label}`}>
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                        {b.type !== "product" && (
                          <button onClick={() => remove(b.id)} className="grid h-8 w-8 place-items-center rounded text-subtle hover:text-danger" aria-label={`Remover ${BLOCK_LABELS[b.type].label}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setAdding(true)} data-testid="add-block">
                  <Plus className="h-4 w-4" /> Adicionar elemento
                </Button>
                {block && (
                  <div className="mt-5 border-t border-line pt-4">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-accent">{BLOCK_LABELS[block.type].label}</p>
                    <BlockFields block={block} onChange={(patch) => update(block.id, patch)} />
                  </div>
                )}
                <p className="mt-5 flex gap-2 rounded-[var(--radius-md)] border border-line bg-surface-2 p-3 text-[12px] leading-relaxed text-muted">
                  <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  O preço, a moeda, o formulário de compra e o pagamento EPay não são editáveis aqui: vêm sempre dos dados do produto no servidor.
                </p>
              </>
            )}
          </div>
        </aside>

        <div className={cn("min-h-[70dvh] flex-1 overflow-y-auto bg-canvas scrollbar-thin lg:min-h-0", view === "edit" && "hidden lg:block")} aria-label="Pré-visualização ao vivo" data-testid="editor-preview">
          {preview}
        </div>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Adicionar elemento" description="É inserido a seguir ao elemento selecionado." size="lg">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ADDABLE_BLOCKS.map((t) => (
            <button key={t} onClick={() => add(t)} className="rounded-[var(--radius-md)] border border-line p-3 text-left hover:border-accent/50 hover:bg-surface-2" data-testid={`add-${t}`}>
              <span className="block text-sm font-medium">{BLOCK_LABELS[t].label}</span>
              <span className="block text-[12px] text-muted">{BLOCK_LABELS[t].description}</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function ThemePanel({ design, onChange }: { design: CheckoutDesign; onChange: (t: Partial<CheckoutDesign["theme"]>) => void }) {
  const t = design.theme;
  const mode = themeMode(t);
  const pick = (m: "dark" | "light") => {
    const other = CHECKOUT_THEME_PRESETS[m === "dark" ? "light" : "dark"];
    // muda o fundo; a cor principal só muda se ainda for a predefinição do outro tema (mantém personalizações)
    onChange({ mode: m, backgroundColor: CHECKOUT_THEME_PRESETS[m].backgroundColor, ...(t.primaryColor.toUpperCase() === other.primaryColor ? { primaryColor: CHECKOUT_THEME_PRESETS[m].primaryColor } : {}) });
  };
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-[13px] font-medium">Tema do checkout</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tema do checkout">
          {(["dark", "light"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => pick(m)}
              data-testid={`checkout-theme-${m}`}
              className={cn("overflow-hidden rounded-[var(--radius-md)] border text-left transition-colors", mode === m ? "border-accent ring-2 ring-accent/30" : "border-line hover:border-line-strong")}
            >
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
        <p className="mt-1.5 text-[11.5px] text-subtle">Aplica-se só ao checkout deste produto, depois de publicar. Não altera preços nem pagamentos.</p>
      </div>
      {(["primaryColor", "backgroundColor"] as const).map((k) => (
        <Field key={k} label={k === "primaryColor" ? "Cor principal (botão e destaques)" : "Cor de fundo"} name={k}>
          {(p) => (
            <div className="flex items-center gap-2">
              <input type="color" aria-label={`${k === "primaryColor" ? "Cor principal" : "Cor de fundo"} — seletor`} value={/^#[0-9a-f]{6}$/i.test(t[k]) ? t[k] : "#000000"} onChange={(e) => onChange({ [k]: e.target.value })} className="h-10 w-10 shrink-0 cursor-pointer rounded-md border border-line bg-transparent p-0.5" />
              <Input {...p} value={t[k]} onChange={(e) => onChange({ [k]: e.target.value })} maxLength={7} className="font-mono uppercase" />
            </div>
          )}
        </Field>
      ))}
      <Field label="Texto do botão de compra" name="buttonText">
        {(p) => <Input {...p} value={t.buttonText} onChange={(e) => onChange({ buttonText: e.target.value })} maxLength={40} />}
      </Field>
      <Field label="Disposição" name="layout">
        {(p) => (
          <Select {...p} value={t.layout} onChange={(e) => onChange({ layout: e.target.value as "split" | "stacked" })}>
            <option value="split">Duas colunas (conteúdo + formulário)</option>
            <option value="stacked">Uma coluna (conteúdo por cima)</option>
          </Select>
        )}
      </Field>
      <Field label="Faixa de anúncio no topo (opcional)" name="announcement">
        {(p) => <Input {...p} value={t.announcement} onChange={(e) => onChange({ announcement: e.target.value })} maxLength={160} placeholder="Ex.: Oferta de lançamento — só esta semana" />}
      </Field>
    </div>
  );
}

function ListEditor<T>({ items, onChange, render, empty, addLabel, max }: { items: T[]; onChange: (items: T[]) => void; render: (item: T, set: (v: T) => void) => React.ReactNode; empty: T; addLabel: string; max: number }) {
  return (
    <div className="flex flex-col gap-3">
      {items.map((it, i) => (
        <div key={i} className="relative rounded-[var(--radius-md)] border border-line p-3 pt-8">
          <button onClick={() => onChange(items.filter((_, k) => k !== i))} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded text-subtle hover:text-danger" aria-label="Remover item">
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex flex-col gap-3">{render(it, (v) => onChange(items.map((x, k) => (k === i ? v : x))))}</div>
        </div>
      ))}
      {items.length < max && (
        <Button variant="ghost" size="sm" onClick={() => onChange([...items, empty])}>
          <Plus className="h-4 w-4" /> {addLabel}
        </Button>
      )}
    </div>
  );
}

function BlockFields({ block, onChange }: { block: DesignBlock; onChange: (patch: Partial<DesignBlock>) => void }) {
  const txt = (label: string, value: string, key: string, max: number, opts: { area?: boolean; placeholder?: string } = {}) => (
    <Field label={label} name={key}>
      {(p) =>
        opts.area ? (
          <Textarea {...p} value={value} onChange={(e) => onChange({ [key]: e.target.value } as Partial<DesignBlock>)} maxLength={max} rows={4} placeholder={opts.placeholder} />
        ) : (
          <Input {...p} value={value} onChange={(e) => onChange({ [key]: e.target.value } as Partial<DesignBlock>)} maxLength={max} placeholder={opts.placeholder} />
        )
      }
    </Field>
  );

  switch (block.type) {
    case "product":
      return (
        <div className="flex flex-col gap-4">
          <p className="text-[12.5px] text-muted">Mostra a imagem, o nome, a descrição e o <strong>preço real</strong> do produto. Os textos abaixo são opcionais e substituem apenas a apresentação.</p>
          <Checkbox label="Mostrar imagem do produto" checked={block.showImage} onChange={(e) => onChange({ showImage: e.target.checked })} />
          {txt("Título (opcional)", block.headline, "headline", 140, { placeholder: "Usa o nome do produto" })}
          {txt("Subtítulo (opcional)", block.subheadline, "subheadline", 1000, { area: true, placeholder: "Usa a descrição do produto" })}
        </div>
      );
    case "banner":
    case "image":
      return (
        <div className="flex flex-col gap-4">
          {txt("Endereço da imagem (https://)", block.imageUrl, "imageUrl", 2000, { placeholder: "https://…/imagem.jpg" })}
          {txt("Texto alternativo", block.alt, "alt", 140)}
          {block.type === "image" ? txt("Legenda", block.caption, "caption", 200) : <Checkbox label="Cantos arredondados" checked={block.rounded} onChange={(e) => onChange({ rounded: e.target.checked })} />}
        </div>
      );
    case "text":
      return (
        <div className="flex flex-col gap-4">
          {txt("Título", block.title, "title", 140)}
          {txt("Texto", block.body, "body", 3000, { area: true })}
          <Field label="Alinhamento" name="align">
            {(p) => (
              <Select {...p} value={block.align} onChange={(e) => onChange({ align: e.target.value as "left" | "center" })}>
                <option value="left">À esquerda</option>
                <option value="center">Centrado</option>
              </Select>
            )}
          </Field>
        </div>
      );
    case "video":
      return (
        <div className="flex flex-col gap-4">
          {txt("Link do vídeo (YouTube ou Vimeo)", block.url, "url", 2000, { placeholder: "https://www.youtube.com/watch?v=…" })}
          {txt("Legenda", block.caption, "caption", 140)}
        </div>
      );
    case "testimonials":
      return (
        <div className="flex flex-col gap-4">
          {txt("Título da secção", block.title, "title", 140)}
          <ListEditor
            items={block.items}
            max={12}
            addLabel="Adicionar depoimento"
            empty={{ name: "Nome", text: "Depoimento", role: "", avatarUrl: "", rating: 5 }}
            onChange={(items) => onChange({ items })}
            render={(it, set) => (
              <>
                <Field label="Nome" name="t-name">{(p) => <Input {...p} value={it.name} maxLength={80} onChange={(e) => set({ ...it, name: e.target.value })} />}</Field>
                <Field label="Depoimento" name="t-text">{(p) => <Textarea {...p} value={it.text} maxLength={600} rows={3} onChange={(e) => set({ ...it, text: e.target.value })} />}</Field>
                <Field label="Profissão/cidade (opcional)" name="t-role">{(p) => <Input {...p} value={it.role} maxLength={80} onChange={(e) => set({ ...it, role: e.target.value })} />}</Field>
                <Field label="Foto (https://, opcional)" name="t-avatar">{(p) => <Input {...p} value={it.avatarUrl} maxLength={2000} onChange={(e) => set({ ...it, avatarUrl: e.target.value })} />}</Field>
                <Field label="Estrelas" name="t-rating">
                  {(p) => (
                    <Select {...p} value={String(it.rating)} onChange={(e) => set({ ...it, rating: Number(e.target.value) })}>
                      {[5, 4, 3, 2, 1, 0].map((n) => (
                        <option key={n} value={n}>{n === 0 ? "Sem estrelas" : `${n} estrela${n > 1 ? "s" : ""}`}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              </>
            )}
          />
        </div>
      );
    case "countdown":
      return (
        <div className="flex flex-col gap-4">
          {txt("Título", block.title, "title", 140)}
          <Field label="Tipo" name="mode">
            {(p) => (
              <Select {...p} value={block.mode} onChange={(e) => onChange({ mode: e.target.value as "fixed" | "evergreen" })}>
                <option value="evergreen">Minutos a partir da visita do comprador</option>
                <option value="fixed">Até uma data e hora fixas</option>
              </Select>
            )}
          </Field>
          {block.mode === "evergreen" ? (
            <Field label="Minutos" name="minutes">{(p) => <Input {...p} type="number" min={1} max={10080} value={block.minutes} onChange={(e) => onChange({ minutes: Math.max(1, Math.min(10080, Number(e.target.value) || 1)) })} />}</Field>
          ) : (
            <Field label="Termina em" name="endsAt">{(p) => <Input {...p} type="datetime-local" value={block.endsAt.slice(0, 16)} onChange={(e) => onChange({ endsAt: e.target.value ? new Date(e.target.value).toISOString() : "" })} />}</Field>
          )}
          {txt("Texto quando termina", block.expiredText, "expiredText", 200)}
          <p className="text-[12px] text-subtle">O cronómetro é apenas visual: não altera o preço nem bloqueia a compra.</p>
        </div>
      );
    case "benefits":
      return (
        <div className="flex flex-col gap-4">
          {txt("Título", block.title, "title", 140)}
          <ListEditor items={block.items} max={20} addLabel="Adicionar benefício" empty="Novo benefício" onChange={(items) => onChange({ items })} render={(it, set) => <Field label="Benefício" name="benefit">{(p) => <Input {...p} value={it} maxLength={200} onChange={(e) => set(e.target.value)} />}</Field>} />
        </div>
      );
    case "guarantee":
      return (
        <div className="flex flex-col gap-4">
          {txt("Título", block.title, "title", 140)}
          {txt("Texto", block.body, "body", 1000, { area: true })}
          <Field label="Dias de garantia (0 = mostrar escudo)" name="days">{(p) => <Input {...p} type="number" min={0} max={365} value={block.days} onChange={(e) => onChange({ days: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} />}</Field>
        </div>
      );
    case "faq":
      return (
        <div className="flex flex-col gap-4">
          {txt("Título", block.title, "title", 140)}
          <ListEditor
            items={block.items}
            max={20}
            addLabel="Adicionar pergunta"
            empty={{ q: "Pergunta", a: "Resposta" }}
            onChange={(items) => onChange({ items })}
            render={(it, set) => (
              <>
                <Field label="Pergunta" name="faq-q">{(p) => <Input {...p} value={it.q} maxLength={200} onChange={(e) => set({ ...it, q: e.target.value })} />}</Field>
                <Field label="Resposta" name="faq-a">{(p) => <Textarea {...p} value={it.a} maxLength={1000} rows={3} onChange={(e) => set({ ...it, a: e.target.value })} />}</Field>
              </>
            )}
          />
        </div>
      );
    case "divider":
      return <p className="text-[12.5px] text-muted">Linha para separar secções. Sem opções.</p>;
  }
}
