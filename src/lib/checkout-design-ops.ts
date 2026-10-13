// Operações puras sobre o design (usadas pelo editor visual e testadas isoladamente).
// Nunca removem nem duplicam o formulário de compra, e nunca o deixam numa secção eliminada.
import { SECTION_LAYOUTS, cloneWithNewIds, newSection, type CheckoutDesign, type DesignElement, type DesignSection, type SectionLayout } from "./checkout-design";

export interface Slot {
  sectionId: string;
  col: number;
  index: number;
}

export function locate(d: CheckoutDesign, id: string): (Slot & { el: DesignElement; sectionIndex: number }) | null {
  for (let si = 0; si < d.sections.length; si++) {
    const s = d.sections[si];
    for (let c = 0; c < s.columns.length; c++) {
      const i = s.columns[c].findIndex((e) => e.id === id);
      if (i >= 0) return { sectionId: s.id, sectionIndex: si, col: c, index: i, el: s.columns[c][i] };
    }
  }
  return null;
}

function mapSection(d: CheckoutDesign, sectionId: string, fn: (s: DesignSection) => DesignSection): CheckoutDesign {
  return { ...d, sections: d.sections.map((s) => (s.id === sectionId ? fn(s) : s)) };
}

function clampSlot(d: CheckoutDesign, slot: Slot): Slot | null {
  const s = d.sections.find((x) => x.id === slot.sectionId);
  if (!s || slot.col < 0 || slot.col >= s.columns.length) return null;
  return { ...slot, index: Math.max(0, Math.min(slot.index, s.columns[slot.col].length)) };
}

export function insertElement(d: CheckoutDesign, el: DesignElement, slot: Slot): CheckoutDesign {
  const t = clampSlot(d, slot);
  if (!t) return d;
  return mapSection(d, t.sectionId, (s) => ({ ...s, columns: s.columns.map((col, c) => (c === t.col ? [...col.slice(0, t.index), el, ...col.slice(t.index)] : col)) }));
}

/** Move um elemento para outra posição (mesma coluna, outra coluna ou outra secção). */
export function moveElement(d: CheckoutDesign, id: string, slot: Slot): CheckoutDesign {
  const from = locate(d, id);
  if (!from) return d;
  let index = slot.index;
  // na mesma coluna, a remoção desloca as posições seguintes
  if (from.sectionId === slot.sectionId && from.col === slot.col && index > from.index) index -= 1;
  if (from.sectionId === slot.sectionId && from.col === slot.col && index === from.index) return d;
  const removed = mapSection(d, from.sectionId, (s) => ({ ...s, columns: s.columns.map((col, c) => (c === from.col ? col.filter((e) => e.id !== id) : col)) }));
  const next = insertElement(removed, from.el, { ...slot, index });
  return next === removed ? d : next;
}

export function removeElement(d: CheckoutDesign, id: string): CheckoutDesign {
  const at = locate(d, id);
  if (!at || at.el.type === "checkout") return d;
  return mapSection(d, at.sectionId, (s) => ({ ...s, columns: s.columns.map((col, c) => (c === at.col ? col.filter((e) => e.id !== id) : col)) }));
}

export function duplicateElement(d: CheckoutDesign, id: string): { design: CheckoutDesign; newId: string | null } {
  const at = locate(d, id);
  if (!at || at.el.type === "checkout") return { design: d, newId: null };
  const copy = cloneWithNewIds(at.el);
  return { design: insertElement(d, copy, { sectionId: at.sectionId, col: at.col, index: at.index + 1 }), newId: copy.id };
}

export function updateElement(d: CheckoutDesign, id: string, patch: Partial<DesignElement>): CheckoutDesign {
  const at = locate(d, id);
  if (!at) return d;
  return mapSection(d, at.sectionId, (s) => ({ ...s, columns: s.columns.map((col) => col.map((e) => (e.id === id ? ({ ...e, ...patch, id: e.id, type: e.type } as DesignElement) : e))) }));
}

export function addSection(d: CheckoutDesign, layout: SectionLayout, index: number): { design: CheckoutDesign; section: DesignSection } {
  const s = newSection(layout);
  const i = Math.max(0, Math.min(index, d.sections.length));
  return { design: { ...d, sections: [...d.sections.slice(0, i), s, ...d.sections.slice(i)] }, section: s };
}

export function moveSection(d: CheckoutDesign, id: string, toIndex: number): CheckoutDesign {
  const from = d.sections.findIndex((s) => s.id === id);
  if (from < 0) return d;
  let to = Math.max(0, Math.min(toIndex, d.sections.length));
  if (to > from) to -= 1;
  if (to === from) return d;
  const rest = d.sections.filter((s) => s.id !== id);
  return { ...d, sections: [...rest.slice(0, to), d.sections[from], ...rest.slice(to)] };
}

export function sectionHasCheckout(s: DesignSection) {
  return s.columns.some((c) => c.some((e) => e.type === "checkout"));
}

/** Elimina uma secção. A secção do formulário de compra não pode ser eliminada (mova o formulário primeiro). */
export function removeSection(d: CheckoutDesign, id: string): CheckoutDesign {
  const s = d.sections.find((x) => x.id === id);
  if (!s || sectionHasCheckout(s) || d.sections.length <= 1) return d;
  return { ...d, sections: d.sections.filter((x) => x.id !== id) };
}

export function duplicateSection(d: CheckoutDesign, id: string): { design: CheckoutDesign; newId: string | null } {
  const i = d.sections.findIndex((x) => x.id === id);
  if (i < 0) return { design: d, newId: null };
  const copy = cloneWithNewIds(d.sections[i]);
  return { design: { ...d, sections: [...d.sections.slice(0, i + 1), copy, ...d.sections.slice(i + 1)] }, newId: copy.id };
}

export function updateSectionStyle(d: CheckoutDesign, id: string, patch: Partial<DesignSection["style"]>): CheckoutDesign {
  return mapSection(d, id, (s) => ({ ...s, style: { ...s.style, ...patch } }));
}

/** Muda o número de colunas sem perder elementos: o conteúdo de colunas removidas passa para a última coluna. */
export function setSectionLayout(d: CheckoutDesign, id: string, layout: SectionLayout): CheckoutDesign {
  return mapSection(d, id, (s) => {
    const n = SECTION_LAYOUTS[layout].cols.length;
    const cols = s.columns.slice(0, n).map((c) => [...c]);
    while (cols.length < n) cols.push([]);
    for (const extra of s.columns.slice(n)) cols[n - 1].push(...extra);
    return { ...s, layout, columns: cols };
  });
}
