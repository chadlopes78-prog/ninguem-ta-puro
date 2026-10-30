"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Eye,
  GripVertical,
  Lock,
  Palette,
  Monitor,
  Redo2,
  RotateCcw,
  Save,
  Send,
  Settings2,
  Smartphone,
  Tablet,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { ActionResult, FieldErrors } from "@/server/validation/common";
import { CheckoutView, type CheckoutViewData, type EditorHooks } from "@/components/checkouts/checkout-view";
import { ELEMENT_INFO, ADDABLE_ELEMENTS, classicDesign, defaultDesign, isProtectedElement, newElement, restoreDefaultStyle, type AddableType, type CheckoutDesign, type DesignElement, type ElementStyle, type SectionLayout } from "@/lib/checkout-design";
import {
  addSection,
  duplicateElement,
  duplicateSection,
  insertElement,
  locate,
  moveElement,
  moveSection,
  removeElement,
  removeSection,
  sectionHasCheckout,
  setSectionLayout,
  updateElement,
  updateSectionStyle,
  type Slot,
} from "@/lib/checkout-design-ops";
import { ElementProperties, PageProperties, SectionProperties } from "./properties";

type Status = "default" | "published" | "unpublished_changes";
type Selection = { kind: "element"; id: string } | { kind: "section"; id: string } | { kind: "page" };
type Drop = { kind: "element"; slot: Slot } | { kind: "section"; index: number } | null;
type Device = "desktop" | "tablet" | "mobile";
const DEVICES: { id: Device; label: string; width: number; icon: typeof Monitor }[] = [
  { id: "desktop", label: "Computador", width: 1200, icon: Monitor },
  { id: "tablet", label: "Tablet", width: 820, icon: Tablet },
  { id: "mobile", label: "Telemóvel", width: 390, icon: Smartphone },
];

/**
 * Mostra a página na largura real do dispositivo escolhido e reduz à escala do espaço disponível
 * (como num construtor visual): o computador é sempre desenhado a 1200 px, mesmo num ecrã estreito.
 */
function ScaledFrame({ width, device, children }: { width: number; device: Device; children: React.ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ avail: width, height: 0 });
  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const measure = () => setBox((b) => (b.avail === o.clientWidth && b.height === i.offsetHeight ? b : { avail: o.clientWidth, height: i.offsetHeight }));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(i);
    return () => ro.disconnect();
  }, []);
  const scale = Math.min(1, box.avail / width);
  const left = Math.max(0, (box.avail - width * scale) / 2);
  return (
    <div ref={outer} className="w-full">
      <div className="relative" style={{ height: box.height ? box.height * scale : undefined }}>
        <div
          ref={inner}
          className={cn("absolute top-0 overflow-hidden border border-line bg-canvas shadow-[var(--shadow-card)]", device === "desktop" ? "rounded-xl" : "rounded-[22px] border-[6px] border-surface-3")}
          style={{ width, left, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "top left" }}
          data-editor-canvas
          data-device={device}
          data-scale={scale.toFixed(3)}
          data-testid="editor-canvas"
        >
          {children}
        </div>
      </div>
    </div>
  );
}

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
  published: (
    <Badge tone="success" dot>
      Publicado
    </Badge>
  ),
  unpublished_changes: <Badge tone="warning">Alterações por publicar</Badge>,
};

// ───────────────────────────── histórico (desfazer/refazer) ─────────────────────────────

function useHistory(initial: CheckoutDesign) {
  const [state, setState] = useState({ past: [] as CheckoutDesign[], present: initial, future: [] as CheckoutDesign[] });
  const last = useRef({ key: "", at: 0 });
  /** Aplica uma alteração. Alterações seguidas com a mesma chave (ex.: escrever num campo) contam como um só passo. */
  const commit = useCallback((fn: (d: CheckoutDesign) => CheckoutDesign, key?: string) => {
    const now = Date.now();
    const coalesce = !!key && last.current.key === key && now - last.current.at < 1200;
    last.current = { key: key ?? "", at: now };
    setState((s) => {
      const next = fn(s.present);
      if (next === s.present) return s;
      return coalesce ? { ...s, present: next, future: [] } : { past: [...s.past, s.present].slice(-100), present: next, future: [] };
    });
  }, []);
  const undo = useCallback(() => {
    last.current = { key: "", at: 0 };
    setState((s) => (s.past.length ? { past: s.past.slice(0, -1), present: s.past[s.past.length - 1], future: [s.present, ...s.future] } : s));
  }, []);
  const redo = useCallback(() => {
    last.current = { key: "", at: 0 };
    setState((s) => (s.future.length ? { past: [...s.past, s.present], present: s.future[0], future: s.future.slice(1) } : s));
  }, []);
  const reset = useCallback((d: CheckoutDesign) => setState({ past: [], present: d, future: [] }), []);
  return { design: state.present, canUndo: state.past.length > 0, canRedo: state.future.length > 0, commit, undo, redo, reset };
}

// ───────────────────────────── peças arrastáveis ─────────────────────────────

function LibraryItem({ id, label, description, icon, onAdd, testId }: { id: string; label: string; description: string; icon?: React.ReactNode; onAdd: () => void; testId: string }) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...listeners}
      {...attributes}
      onClick={onAdd}
      className={cn("flex w-full touch-manipulation items-start gap-2.5 rounded-[var(--radius-md)] border border-line bg-surface-2/60 p-2.5 text-left transition-colors hover:border-accent/50 hover:bg-surface-2", isDragging && "opacity-40")}
      data-testid={testId}
      title="Arraste para a página ou clique para adicionar"
    >
      {icon ?? <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />}
      <span className="min-w-0">
        <span className="block text-[12.5px] font-medium leading-tight">{label}</span>
        <span className="block text-[11px] leading-snug text-subtle">{description}</span>
      </span>
    </button>
  );
}

function DropLine({ vertical }: { vertical?: boolean }) {
  return <div className={cn("pointer-events-none rounded-full bg-accent shadow-[0_0_0_3px_rgb(200_241_53/0.25)]", vertical ? "mx-auto my-1 h-[3px] w-full" : "my-1 h-[3px] w-full")} aria-hidden="true" data-testid="drop-indicator" />;
}

function CanvasElement({
  el,
  selected,
  dragging,
  lineBefore,
  onSelect,
  onDuplicate,
  onDelete,
  onMove,
  children,
}: {
  el: DesignElement;
  selected: boolean;
  dragging: boolean;
  lineBefore: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  children: React.ReactNode;
}) {
  const drag = useDraggable({ id: `el:${el.id}` });
  const drop = useDroppable({ id: `el:${el.id}` });
  const locked = isProtectedElement(el);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <>
      {lineBefore && <DropLine />}
      <div
        ref={(n) => {
          drag.setNodeRef(n);
          drop.setNodeRef(n);
        }}
        {...drag.listeners}
        {...drag.attributes}
        aria-label={`${ELEMENT_INFO[el.type].label} — clique para editar, arraste para mover`}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onKeyDown={(e) => {
          // só o próprio elemento (não os campos do formulário dentro dele) inicia o arrastar por teclado
          if (e.target === e.currentTarget) drag.listeners?.onKeyDown?.(e);
          if (e.key === "Enter" && !e.defaultPrevented) onSelect();
        }}
        className={cn(
          "group/el relative cursor-grab rounded-lg outline-offset-[3px] transition-[outline-color,opacity] active:cursor-grabbing",
          selected ? "outline-2 outline-solid outline-[var(--color-accent)]" : "outline-1 outline-dashed outline-transparent hover:outline-[rgb(200_241_53/0.6)]",
          dragging && "opacity-35",
        )}
        data-editor-element={el.id}
        data-type={el.type}
        data-testid="canvas-element"
      >
        {children}
        <span className={cn("pointer-events-none absolute -top-[11px] left-2 z-20 hidden rounded bg-accent px-1.5 py-px text-[10.5px] font-semibold text-accent-ink", selected ? "block" : "group-hover/el:block")}>
          {locked && <Lock className="mr-0.5 inline h-2.5 w-2.5" aria-hidden="true" />}
          {ELEMENT_INFO[el.type].label}
        </span>
        {selected && (
          <div className="absolute -top-[15px] right-2 z-20 pointer-coarse:-top-[22px] flex overflow-hidden rounded-md border border-line bg-surface text-fg shadow-lg" onPointerDown={stop} onMouseDown={stop} onTouchStart={stop} onClick={stop}>
            <button type="button" onClick={() => onMove(-1)} className="grid h-7 w-7 place-items-center hover:bg-surface-2 pointer-coarse:h-9 pointer-coarse:w-9" aria-label="Mover para cima" title="Mover para cima" data-testid="el-move-up">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => onMove(1)} className="grid h-7 w-7 place-items-center hover:bg-surface-2 pointer-coarse:h-9 pointer-coarse:w-9" aria-label="Mover para baixo" title="Mover para baixo" data-testid="el-move-down">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            {!locked && (
              <>
                <button type="button" onClick={onDuplicate} className="grid h-7 w-7 place-items-center hover:bg-surface-2 pointer-coarse:h-9 pointer-coarse:w-9" aria-label="Duplicar" title="Duplicar (Ctrl+D)" data-testid="el-duplicate">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={onDelete} className="grid h-7 w-7 place-items-center text-danger hover:bg-danger/10 pointer-coarse:h-9 pointer-coarse:w-9" aria-label="Eliminar" title="Eliminar (Delete)" data-testid="el-delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function CanvasColumn({ id, className, style, children, empty, lineAtEnd, dragging }: { id: string; className: string; style: React.CSSProperties; children: React.ReactNode; empty: boolean; lineAtEnd: boolean; dragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn(className, "min-h-full rounded-lg", (empty || dragging) && "outline-1 outline-dashed outline-offset-2", isOver ? "outline-[var(--color-accent)]" : "outline-[rgb(128_128_128/0.35)]", empty && "min-h-24 justify-center")} style={style} data-testid="canvas-column">
      {children}
      {lineAtEnd && <DropLine />}
      {empty && !lineAtEnd && <p className="pointer-events-none select-none py-6 text-center text-[12.5px] opacity-60">Arraste elementos para aqui</p>}
    </div>
  );
}

function CanvasSection({ id, selected, hasCheckout, lineBefore, lineAfter, dragging, onSelect, onDuplicate, onDelete, children }: { id: string; selected: boolean; hasCheckout: boolean; lineBefore: boolean; lineAfter: boolean; dragging: boolean; onSelect: () => void; onDuplicate: () => void; onDelete: () => void; children: React.ReactNode }) {
  const drop = useDroppable({ id: `sec:${id}` });
  const drag = useDraggable({ id: `sec:${id}` });
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <>
      {lineBefore && <div className="h-1.5 bg-accent" aria-hidden="true" data-testid="drop-indicator" />}
      <div
        ref={drop.setNodeRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        className={cn("group/sec relative outline-offset-[-2px]", selected ? "outline-2 outline-solid outline-[#60a5fa]" : "outline-1 outline-dashed outline-transparent hover:outline-[rgb(96_165_250/0.7)]", dragging && "opacity-40")}
        data-editor-section={id}
        data-testid="canvas-section"
      >
        <div className={cn("absolute left-1/2 top-0 z-30 -translate-x-1/2 overflow-hidden rounded-b-md bg-[#60a5fa] text-black shadow", selected ? "flex" : "hidden group-hover/sec:flex")} onClick={stop}>
          <button ref={drag.setNodeRef} type="button" {...drag.listeners} {...drag.attributes} className="grid h-6 w-7 cursor-grab place-items-center hover:bg-black/10 active:cursor-grabbing" aria-label="Arrastar secção" title="Arrastar secção" data-testid="section-handle">
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onSelect} className="grid h-6 w-7 place-items-center hover:bg-black/10" aria-label="Definições da secção" title="Definições da secção">
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={onDuplicate} className="grid h-6 w-7 place-items-center hover:bg-black/10" aria-label="Duplicar secção" title="Duplicar secção" data-testid="section-duplicate">
            <Copy className="h-3.5 w-3.5" />
          </button>
          {!hasCheckout && (
            <button type="button" onClick={onDelete} className="grid h-6 w-7 place-items-center hover:bg-black/10" aria-label="Eliminar secção" title="Eliminar secção" data-testid="section-delete">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {children}
      </div>
      {lineAfter && <div className="h-1.5 bg-accent" aria-hidden="true" data-testid="drop-indicator" />}
    </>
  );
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

// ───────────────────────────── editor ─────────────────────────────

export function CheckoutEditor(props: Props) {
  const h = useHistory(props.initial);
  const design = h.design;
  const [savedJson, setSavedJson] = useState(() => JSON.stringify(props.initial));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [sel, setSel] = useState<Selection>({ kind: "page" });
  const [device, setDevice] = useState<Device>("desktop");
  // num telemóvel, começa a editar a vista de telemóvel
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setDevice("mobile");
  }, []);
  const [pane, setPane] = useState<"library" | "canvas" | "props">("canvas");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; run: () => void }>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drop, setDrop] = useState<Drop>(null);
  const dropRef = useRef<Drop>(null);
  const startPoint = useRef<{ x: number; y: number } | null>(null);
  const toast = useToast();
  const router = useRouter();
  const dirty = JSON.stringify(design) !== savedJson;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const setDropBoth = (d: Drop) => {
    dropRef.current = d;
    setDrop((cur) => (JSON.stringify(cur) === JSON.stringify(d) ? cur : d));
  };

  // ── seleção ──
  const selectedEl = sel.kind === "element" ? locate(design, sel.id)?.el ?? null : null;
  const selectedSection = sel.kind === "section" ? design.sections.find((s) => s.id === sel.id) ?? null : null;
  useEffect(() => {
    if (sel.kind === "element" && !locate(design, sel.id)) setSel({ kind: "page" });
    if (sel.kind === "section" && !design.sections.some((s) => s.id === sel.id)) setSel({ kind: "page" });
  }, [design, sel]);

  // ── operações ──
  const addSlot = (): Slot => {
    if (sel.kind === "element") {
      const at = locate(design, sel.id);
      if (at) return { sectionId: at.sectionId, col: at.col, index: at.index + 1 };
    }
    const s = (sel.kind === "section" && design.sections.find((x) => x.id === sel.id)) || design.sections[0];
    return { sectionId: s.id, col: 0, index: s.columns[0].length };
  };
  const addElement = (type: AddableType, slot = addSlot()) => {
    const el = newElement(type);
    h.commit((d) => insertElement(d, el, slot));
    setSel({ kind: "element", id: el.id });
  };
  const addNewSection = (layout: SectionLayout, index?: number) => {
    const i = index ?? (sel.kind === "section" ? design.sections.findIndex((s) => s.id === sel.id) + 1 : design.sections.length);
    const { section } = addSection(design, layout, i);
    h.commit((d) => ({ ...d, sections: [...d.sections.slice(0, i), section, ...d.sections.slice(i)] }));
    setSel({ kind: "section", id: section.id });
  };
  const deleteEl = (id: string) => {
    const target = locate(design, id)?.el;
    if (target && isProtectedElement(target)) {
      toast(target.type === "checkout" ? "O formulário de compra não pode ser eliminado — pode movê-lo para outra posição." : "Este elemento está protegido (produto/preço) e não pode ser eliminado — pode movê-lo.", "error");
      return;
    }
    h.commit((d) => removeElement(d, id));
    setSel({ kind: "page" });
  };
  const duplicateEl = (id: string) => {
    const r = duplicateElement(design, id);
    if (!r.newId) return;
    h.commit(() => r.design);
    setSel({ kind: "element", id: r.newId });
  };
  const nudge = (id: string, dir: -1 | 1) => {
    const at = locate(design, id);
    if (!at) return;
    const s = design.sections[at.sectionIndex];
    const len = s.columns[at.col].length;
    if (dir === -1 && at.index > 0) h.commit((d) => moveElement(d, id, { sectionId: at.sectionId, col: at.col, index: at.index - 1 }));
    else if (dir === 1 && at.index < len - 1) h.commit((d) => moveElement(d, id, { sectionId: at.sectionId, col: at.col, index: at.index + 2 }));
    else {
      // no limite da coluna: passa para a secção anterior/seguinte
      const ns = design.sections[at.sectionIndex + dir];
      if (ns) h.commit((d) => moveElement(d, id, { sectionId: ns.id, col: Math.min(at.col, ns.columns.length - 1), index: dir === -1 ? ns.columns[Math.min(at.col, ns.columns.length - 1)].length : 0 }));
    }
  };
  const deleteSec = (id: string) => {
    const s = design.sections.find((x) => x.id === id);
    if (!s) return;
    if (sectionHasCheckout(s)) {
      toast("Esta secção contém o formulário de compra. Mova o formulário para outra secção antes de a eliminar.", "error");
      return;
    }
    if (design.sections.length <= 1) return;
    setConfirm({ title: "Eliminar secção", body: "A secção e todos os elementos dentro dela serão removidos do rascunho. Pode desfazer com Ctrl+Z.", label: "Eliminar", run: () => (h.commit((d) => removeSection(d, id)), setSel({ kind: "page" })) });
  };

  // ── atalhos de teclado ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !isTyping(e.target)) {
        e.preventDefault();
        if (e.shiftKey) h.redo();
        else h.undo();
      } else if (mod && e.key.toLowerCase() === "y" && !isTyping(e.target)) {
        e.preventDefault();
        h.redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveDraft();
      } else if (mod && e.key.toLowerCase() === "d" && sel.kind === "element" && !isTyping(e.target)) {
        e.preventDefault();
        duplicateEl(sel.id);
      } else if ((e.key === "Delete" || e.key === "Backspace") && sel.kind === "element" && !isTyping(e.target) && !activeId) {
        e.preventDefault();
        deleteEl(sel.id);
      } else if (e.key === "Escape" && !activeId) setSel({ kind: "page" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── aviso antes de sair com alterações por guardar ──
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.closest("[data-editor-canvas]")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setConfirm({
        title: "Sair sem guardar?",
        body: "Tem alterações que ainda não foram guardadas. Se sair agora, perde-as.",
        label: "Sair sem guardar",
        run: () => {
          dirtyRef.current = false;
          router.push(url.pathname + url.search);
        },
      });
    };
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBefore);
      document.removeEventListener("click", onClick, true);
    };
  }, [router]);

  // ── guardar / publicar ──
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
          setErrors((r as { fieldErrors?: FieldErrors }).fieldErrors ?? {});
          toast(r.error, "error");
        }
      } catch {
        toast("Erro de rede. As alterações continuam no editor — tente novamente.", "error");
      }
    });
  const markSaved = (d: CheckoutDesign) => {
    setSavedJson(JSON.stringify(d));
    setSavedAt(new Date());
  };
  function saveDraft() {
    const d = design;
    run(() => props.saveAction(d), () => markSaved(d));
  }
  const publish = () => {
    const d = design;
    run(() => props.publishAction(d), () => markSaved(d));
  };
  const preview = () => {
    // abre já o separador (evita o bloqueio de janelas) e só depois guarda o rascunho
    const w = window.open("about:blank", "_blank");
    const url = `/checkouts/personalizar/${props.productId}/preview`;
    if (!dirty) {
      if (w) w.location.href = url;
      return;
    }
    const d = design;
    start(async () => {
      const r = await props.saveAction(d).catch(() => null);
      if (r?.ok) {
        markSaved(d);
        router.refresh();
        if (w) w.location.href = url;
      } else {
        w?.close();
        toast(r && !r.ok ? r.error : "Não foi possível guardar o rascunho para pré-visualizar.", "error");
      }
    });
  };

  // ── arrastar e soltar ──
  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }), useSensor(KeyboardSensor));
  const collision: CollisionDetection = useCallback((args) => {
    const sectionDrag = /^(sec|libsec):/.test(String(args.active.id));
    let hits = pointerWithin(args);
    if (!hits.length) hits = rectIntersection(args);
    const of = (p: string) => hits.filter((x) => String(x.id).startsWith(p));
    if (sectionDrag) return of("sec:").slice(0, 1);
    const els = of("el:");
    if (els.length) return [els[els.length - 1]];
    const cols = of("col:");
    if (cols.length) return [cols[0]];
    return of("sec:").slice(0, 1);
  }, []);

  const computeDrop = (active: string, over: string | null, y: number | null): Drop => {
    if (!over) return null;
    const rectOf = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    if (/^(sec|libsec):/.test(active)) {
      const sid = over.split(":")[1];
      const i = design.sections.findIndex((s) => s.id === sid);
      if (i < 0) return null;
      const r = rectOf(`[data-editor-section="${sid}"]`);
      return { kind: "section", index: i + (r && y !== null && y > r.top + r.height / 2 ? 1 : 0) };
    }
    if (over.startsWith("el:")) {
      const id = over.slice(3);
      const at = locate(design, id);
      if (!at) return null;
      const r = rectOf(`[data-editor-element="${id}"]`);
      const after = r && y !== null ? y > r.top + r.height / 2 : true;
      return { kind: "element", slot: { sectionId: at.sectionId, col: at.col, index: at.index + (after ? 1 : 0) } };
    }
    if (over.startsWith("col:")) {
      const [, sid, c] = over.split(":");
      const s = design.sections.find((x) => x.id === sid);
      if (!s) return null;
      return { kind: "element", slot: { sectionId: sid, col: Number(c), index: s.columns[Number(c)]?.length ?? 0 } };
    }
    if (over.startsWith("sec:")) {
      const s = design.sections.find((x) => x.id === over.slice(4));
      return s ? { kind: "element", slot: { sectionId: s.id, col: 0, index: s.columns[0].length } } : null;
    }
    return null;
  };

  const onDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
    const ev = e.activatorEvent as MouseEvent & TouchEvent;
    const t = ev.touches?.[0] ?? ev.changedTouches?.[0];
    startPoint.current = typeof ev.clientX === "number" ? { x: ev.clientX, y: ev.clientY } : t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onDragMove = (e: DragMoveEvent) => {
    const r = e.active.rect.current.translated;
    const y = startPoint.current ? startPoint.current.y + e.delta.y : r ? r.top + r.height / 2 : null;
    setDropBoth(computeDrop(String(e.active.id), e.over ? String(e.over.id) : null, y));
  };
  const endDrag = () => {
    setActiveId(null);
    setDropBoth(null);
    startPoint.current = null;
  };
  const onDragEnd = (e: DragEndEvent) => {
    const a = String(e.active.id);
    const target = dropRef.current;
    endDrag();
    if (!target) return;
    if (target.kind === "section") {
      if (a.startsWith("libsec:")) addNewSection(a.slice(7) as SectionLayout, target.index);
      else if (a.startsWith("sec:")) h.commit((d) => moveSection(d, a.slice(4), target.index));
      return;
    }
    if (a.startsWith("lib:")) addElement(a.slice(4) as AddableType, target.slot);
    else if (a.startsWith("el:")) {
      const id = a.slice(3);
      h.commit((d) => moveElement(d, id, target.slot));
      setSel({ kind: "element", id });
    }
  };

  const activeLabel = activeId
    ? activeId.startsWith("lib:")
      ? ELEMENT_INFO[activeId.slice(4) as AddableType].label
      : activeId.startsWith("el:")
        ? ELEMENT_INFO[locate(design, activeId.slice(3))?.el.type ?? "text"].label
        : "Secção"
    : null;

  // ── ligações do editor ao renderizador do checkout ──
  const elementDrop = drop?.kind === "element" ? drop.slot : null;
  const sectionDrop = drop?.kind === "section" ? drop.index : null;
  const hooks: EditorHooks = {
    section: (s, index, node) => (
      <CanvasSection
        id={s.id}
        selected={sel.kind === "section" && sel.id === s.id}
        hasCheckout={sectionHasCheckout(s)}
        lineBefore={sectionDrop === index}
        lineAfter={sectionDrop === design.sections.length && index === design.sections.length - 1}
        dragging={activeId === `sec:${s.id}`}
        onSelect={() => setSel({ kind: "section", id: s.id })}
        onDuplicate={() => {
          const r = duplicateSection(design, s.id);
          h.commit(() => r.design);
          if (r.newId) setSel({ kind: "section", id: r.newId });
        }}
        onDelete={() => deleteSec(s.id)}
      >
        {node}
      </CanvasSection>
    ),
    column: (s, col, p) => (
      <CanvasColumn id={`col:${s.id}:${col}`} className={p.className} style={p.style} empty={p.empty} dragging={!!activeId && !/^(sec|libsec):/.test(activeId)} lineAtEnd={!!elementDrop && elementDrop.sectionId === s.id && elementDrop.col === col && elementDrop.index === s.columns[col].length}>
        {p.children}
      </CanvasColumn>
    ),
    element: (el, at, node) => (
      <CanvasElement
        el={el}
        selected={sel.kind === "element" && sel.id === el.id}
        dragging={activeId === `el:${el.id}`}
        lineBefore={!!elementDrop && elementDrop.sectionId === at.sectionId && elementDrop.col === at.col && elementDrop.index === at.index}
        onSelect={() => setSel({ kind: "element", id: el.id })}
        onDuplicate={() => duplicateEl(el.id)}
        onDelete={() => deleteEl(el.id)}
        onMove={(dir) => nudge(el.id, dir)}
      >
        {node}
      </CanvasElement>
    ),
  };

  const deviceWidth = DEVICES.find((d) => d.id === device)!.width;
  const errorList = Object.entries(errors).filter(([k]) => k.startsWith("sections") || k.startsWith("theme") || k === "_form");

  // ── painéis ──
  const allElements = design.sections.flatMap((x) => x.columns.flat());
  const protectedItems = [
    { label: "Nome do produto", find: (e: DesignElement) => e.type === "heading" && e.source === "productName" },
    { label: "Preço", find: (e: DesignElement) => e.type === "price" },
    { label: "Formulário e pagamento", find: (e: DesignElement) => e.type === "checkout" },
  ].map((x) => ({ ...x, el: allElements.find(x.find) }));
  const library = (
    <div className="flex flex-col gap-5 p-3" data-testid="element-library">
      <div>
        <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-subtle">Elementos</p>
        <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1 xl:grid-cols-2">
          {ADDABLE_ELEMENTS.map((t) => (
            <LibraryItem key={t} id={`lib:${t}`} label={ELEMENT_INFO[t].label} description={ELEMENT_INFO[t].description} onAdd={() => (addElement(t), setPane("canvas"))} testId={`lib-${t}`} />
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] leading-snug text-subtle">Clique para adicionar abaixo do elemento selecionado, ou arraste para a posição desejada.</p>
      </div>
      <div>
        <p className="mb-2 px-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-subtle">Produto e pagamento (protegidos)</p>
        <div className="flex flex-col gap-1.5">
          {protectedItems.map((x) => (
            <button
              key={x.label}
              type="button"
              disabled={!x.el}
              onClick={() => {
                if (x.el) setSel({ kind: "element", id: x.el.id });
                setPane("canvas");
              }}
              className="flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-dashed border-line p-2.5 text-left hover:border-line-strong disabled:opacity-50"
              data-testid="lib-protected"
            >
              <Lock className="h-3.5 w-3.5 shrink-0 text-subtle" aria-hidden="true" />
              <span className="text-[12.5px] font-medium">{x.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 px-1 text-[11px] leading-snug text-subtle">Pode mudá-los de posição e ajustar o aspeto; não podem ser eliminados, e o preço e o pagamento vêm sempre do produto.</p>
      </div>
    </div>
  );

  const properties = selectedEl ? (
    <ElementProperties
      key={selectedEl.id}
      el={selectedEl}
      theme={design.theme}
      onTheme={(t) => h.commit((d) => ({ ...d, theme: { ...d.theme, ...t } }), `theme:${Object.keys(t).join(",")}`)}
      onChange={(patch) => h.commit((d) => updateElement(d, selectedEl.id, patch), `el:${selectedEl.id}:${Object.keys(patch).join(",")}`)}
      onStyle={(patch: Partial<ElementStyle>) =>
        h.commit((d) => {
          const cur = locate(d, selectedEl.id)?.el;
          if (!cur) return d;
          const style = { ...cur.style, ...patch } as Record<string, unknown>;
          for (const k of Object.keys(style)) if (style[k] === undefined) delete style[k];
          return updateElement(d, selectedEl.id, { style } as Partial<DesignElement>);
        }, `style:${selectedEl.id}:${Object.keys(patch).join(",")}`)
      }
    />
  ) : selectedSection ? (
    <SectionProperties
      key={selectedSection.id}
      section={selectedSection}
      hasCheckout={sectionHasCheckout(selectedSection)}
      onLayout={(l) => h.commit((d) => setSectionLayout(d, selectedSection.id, l))}
      onStyle={(patch) => h.commit((d) => updateSectionStyle(d, selectedSection.id, patch), `sec:${selectedSection.id}:${Object.keys(patch).join(",")}`)}
    />
  ) : (
    <PageProperties
      design={design}
      onTheme={(t) => h.commit((d) => ({ ...d, theme: { ...d.theme, ...t } }), `theme:${Object.keys(t).join(",")}`)}
      onRestoreStyle={() => {
        h.commit((d) => restoreDefaultStyle(d));
        toast("Estilo padrão reposto (pode desfazer com Ctrl+Z).");
      }}
      onRestoreTemplate={() =>
        setConfirm({
          title: "Restaurar estrutura padrão?",
          body: "O checkout volta ao modelo padrão (cronómetro, produto, prova social, avaliações e formulário de compra). Os elementos que adicionou são removidos do rascunho; pode desfazer com Ctrl+Z.",
          label: "Restaurar",
          run: () => (h.commit((d) => ({ ...defaultDesign(d.theme), theme: { ...d.theme, stickyPayBar: true } })), setSel({ kind: "page" })),
        })
      }
      onUseClassic={() =>
        setConfirm({
          title: "Usar o modelo clássico?",
          body: "O checkout passa a ter a estrutura simples: nome, imagem, preço e formulário de compra clássico (sem botão fixo). Os elementos que adicionou são removidos do rascunho; pode desfazer com Ctrl+Z.",
          label: "Usar modelo clássico",
          run: () => (h.commit((d) => ({ ...classicDesign(d.theme), theme: { ...d.theme, stickyPayBar: false } })), setSel({ kind: "page" })),
        })
      }
    />
  );

  return (
    <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={endDrag}>
      {/* ecrã inteiro (como um construtor visual): mais espaço para a página; ← volta ao painel */}
      <div className="fixed inset-0 z-40 flex min-h-0 flex-col bg-canvas" data-testid="checkout-editor">
        {/* Barra superior */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface px-3 py-2 sm:px-4">
          <Link href="/checkouts" className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label="Voltar a Personalizar Checkout">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-subtle">Editor visual do checkout</p>
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="truncate font-display text-[15px] font-semibold">{props.productName}</span>
              {STATUS_BADGE[props.status]}
              <span className={cn("text-[12px]", dirty ? "text-warning" : "text-subtle")} data-testid="save-status" aria-live="polite">
                {pending ? "A guardar…" : dirty ? "Alterações por guardar" : savedAt ? `Guardado às ${savedAt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}` : "Sem alterações"}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={h.undo} disabled={!h.canUndo} aria-label="Desfazer" title="Desfazer (Ctrl+Z)" data-testid="undo">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={h.redo} disabled={!h.canRedo} aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" data-testid="redo">
              <Redo2 className="h-4 w-4" />
            </Button>
            <div className="mx-1 hidden h-6 w-px bg-line sm:block" />
            <div className="hidden rounded-[var(--radius-md)] border border-line bg-surface-2 p-0.5 sm:flex" role="radiogroup" aria-label="Dispositivo da pré-visualização">
              {DEVICES.map((d) => (
                <button key={d.id} type="button" role="radio" aria-checked={device === d.id} onClick={() => setDevice(d.id)} className={cn("grid h-7 w-8 place-items-center rounded-[6px]", device === d.id ? "bg-surface-3 text-fg" : "text-muted hover:text-fg")} aria-label={d.label} title={d.label} data-testid={`device-${d.id}`}>
                  <d.icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={preview} disabled={pending} aria-label="Pré-visualizar" title="Abre o rascunho (guardado) num novo separador — não publica" data-testid="preview">
              <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Pré-visualizar</span>
            </Button>
            {dirty && (
              <Button variant="ghost" size="sm" onClick={() => setConfirm({ title: "Cancelar alterações?", body: "As alterações feitas desde a última gravação serão perdidas.", label: "Cancelar alterações", run: () => (h.reset(JSON.parse(savedJson)), setSel({ kind: "page" })) })} data-testid="cancel-changes">
                <X className="h-4 w-4" /> <span className="hidden sm:inline">Cancelar</span>
              </Button>
            )}
            {props.status === "unpublished_changes" && props.hasPublished && !dirty && (
              <Button variant="ghost" size="sm" onClick={() => setConfirm({ title: "Descartar rascunho?", body: "O rascunho volta a ser igual à versão publicada.", label: "Descartar rascunho", run: () => run(props.discardAction, () => window.location.reload()) })} title="Volta à versão publicada">
                <RotateCcw className="h-4 w-4" /> <span className="hidden sm:inline">Descartar rascunho</span>
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={saveDraft} loading={pending} data-testid="save-draft">
              <Save className="h-4 w-4" /> <span className="hidden sm:inline">Guardar rascunho</span><span className="sm:hidden">Guardar</span>
            </Button>
            <Button size="sm" onClick={publish} loading={pending} data-testid="publish">
              <Send className="h-4 w-4" /> Publicar
            </Button>
          </div>
        </div>

        {/* Separadores em ecrãs pequenos */}
        <div className="grid grid-cols-3 border-b border-line bg-surface lg:hidden" role="tablist">
          {(
            [
              ["library", "Elementos"],
              ["canvas", "Página"],
              ["props", sel.kind === "page" ? "Estilo" : "Propriedades"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={pane === k} onClick={() => setPane(k)} className={cn("h-10 text-[13px] font-medium", pane === k ? "border-b-2 border-accent text-fg" : "text-muted")} data-testid={`pane-${k}`}>
              {l}
            </button>
          ))}
        </div>

        {errorList.length > 0 && (
          <ul className="flex flex-col gap-1 border-b border-danger/30 bg-danger/[0.06] px-4 py-2 text-[12.5px] text-danger" role="alert">
            {errorList.map(([k, v]) => (
              <li key={k}>{v}</li>
            ))}
          </ul>
        )}

        <div className="flex min-h-0 flex-1">
          <aside className={cn("min-h-0 w-full shrink-0 overflow-y-auto border-line bg-surface scrollbar-thin lg:block lg:w-[264px] lg:border-r", pane === "library" ? "block" : "hidden")} aria-label="Elementos">
            {library}
          </aside>

          <div className={cn("min-h-0 min-w-0 flex-1 flex-col bg-canvas lg:flex", pane === "canvas" ? "flex" : "hidden")}>
            <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5 text-[12px] text-subtle sm:hidden">
              <span>Toque para selecionar · mantenha premido para arrastar</span>
              <div className="flex rounded-md border border-line p-0.5">
                {DEVICES.filter((d) => d.id !== "tablet").map((d) => (
                  <button key={d.id} type="button" onClick={() => setDevice(d.id)} aria-label={d.label} className={cn("grid h-8 w-9 place-items-center rounded", device === d.id ? "bg-surface-3 text-fg" : "text-muted")}>
                    <d.icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3 scrollbar-thin sm:p-5" onClick={() => setSel({ kind: "page" })} data-testid="editor-preview">
              <ScaledFrame key={device} width={deviceWidth} device={device}>
                <CheckoutView data={props.previewData} design={design} mode="preview" editor={hooks} />
              </ScaledFrame>
              <div className="mx-auto mt-3 flex justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                <Button variant="outline" size="sm" onClick={() => (setSel({ kind: "page" }), setPane("props"))} data-testid="checkout-style">
                  <Palette className="h-4 w-4" /> Estilo do checkout
                </Button>
              </div>
            </div>
            {sel.kind !== "page" && (
              <div className="flex items-center justify-between gap-2 border-t border-line bg-surface px-3 py-2 lg:hidden">
                <span className="truncate text-[12.5px] text-muted">{selectedEl ? ELEMENT_INFO[selectedEl.type].label : "Secção"} selecionado</span>
                <Button size="sm" variant="secondary" onClick={() => setPane("props")}>
                  Editar propriedades
                </Button>
              </div>
            )}
          </div>

          <aside className={cn("min-h-0 w-full shrink-0 overflow-y-auto border-line bg-surface scrollbar-thin lg:block lg:w-[320px] lg:border-l", pane === "props" ? "block" : "hidden")} aria-label="Propriedades">
            {properties}
          </aside>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeLabel && (
          <div className="pointer-events-none flex items-center gap-2 rounded-lg border border-accent/60 bg-surface px-3 py-2 text-[13px] font-medium shadow-xl">
            <GripVertical className="h-3.5 w-3.5 text-accent" /> {activeLabel}
          </div>
        )}
      </DragOverlay>

      <Modal
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Voltar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                c?.run();
              }}
              data-testid="confirm-action"
            >
              {confirm?.label}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">{confirm?.body}</p>
      </Modal>
    </DndContext>
  );
}
