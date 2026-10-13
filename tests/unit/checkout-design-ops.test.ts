import { describe, expect, it } from "vitest";
import { defaultDesign, designSchema, newElement, type CheckoutDesign } from "@/lib/checkout-design";
import { addSection, duplicateElement, duplicateSection, insertElement, locate, moveElement, moveSection, removeElement, removeSection, setSectionLayout } from "@/lib/checkout-design-ops";

const base = () => defaultDesign({ primaryColor: "#C8F135", backgroundColor: "#0B0C0E", buttonText: "Finalizar compra" });
const order = (d: CheckoutDesign, sid = "hero", col = 0) => d.sections.find((s) => s.id === sid)!.columns[col].map((e) => e.id);

describe("operações do editor visual", () => {
  it("o modelo padrão é válido e tem o formulário de compra exatamente uma vez", () => {
    const d = base();
    expect(designSchema.safeParse(d).success).toBe(true);
    expect(order(d)).toEqual(["product-image", "product-name", "product-description", "product-price"]);
    expect(order(d, "hero", 1)).toEqual(["checkout"]);
  });

  it("inserir uma imagem acima do título e movê-la para baixo do título", () => {
    const img = newElement("image");
    let d = insertElement(base(), img, { sectionId: "hero", col: 0, index: 1 });
    expect(order(d)).toEqual(["product-image", img.id, "product-name", "product-description", "product-price"]);
    // arrastar para depois do título (posição 3 antes de remover → fica na 2)
    d = moveElement(d, img.id, { sectionId: "hero", col: 0, index: 3 });
    expect(order(d)).toEqual(["product-image", "product-name", img.id, "product-description", "product-price"]);
    // largar no mesmo sítio não muda nada
    expect(moveElement(d, img.id, { sectionId: "hero", col: 0, index: 2 })).toBe(d);
    expect(designSchema.safeParse(d).success).toBe(true);
  });

  it("mover entre colunas e secções; o formulário de compra pode mudar de posição", () => {
    let d = moveElement(base(), "product-price", { sectionId: "hero", col: 1, index: 0 });
    expect(order(d, "hero", 1)).toEqual(["product-price", "checkout"]);
    const { design, section } = addSection(d, "1", 1);
    d = moveElement(design, "checkout", { sectionId: section.id, col: 0, index: 0 });
    expect(locate(d, "checkout")?.sectionId).toBe(section.id);
    expect(designSchema.safeParse(d).success).toBe(true);
  });

  it("o formulário de compra não é eliminado, duplicado nem perdido com a secção", () => {
    const d = base();
    expect(removeElement(d, "checkout")).toBe(d);
    expect(duplicateElement(d, "checkout").newId).toBeNull();
    expect(removeSection(d, "hero")).toBe(d);
    const dup = duplicateSection(d, "hero");
    const all = dup.design.sections.flatMap((s) => s.columns.flat());
    expect(all.filter((e) => e.type === "checkout")).toHaveLength(1);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    expect(designSchema.safeParse(dup.design).success).toBe(true);
  });

  it("duplicar e eliminar elementos; reordenar secções", () => {
    let d = base();
    const r = duplicateElement(d, "product-name");
    d = r.design;
    expect(order(d)[2]).toBe(r.newId);
    d = removeElement(d, r.newId!);
    expect(order(d)).toEqual(base().sections[0].columns[0].map((e) => e.id));
    const s1 = addSection(d, "1-1", 0);
    d = moveSection(s1.design, s1.section.id, 2);
    expect(d.sections.map((s) => s.id)).toEqual(["hero", s1.section.id]);
  });

  it("reduzir colunas não perde elementos", () => {
    const d = setSectionLayout(base(), "hero", "1");
    expect(d.sections[0].columns).toHaveLength(1);
    expect(order(d)).toEqual(["product-image", "product-name", "product-description", "product-price", "checkout"]);
    const d3 = setSectionLayout(d, "hero", "1-1-1");
    expect(d3.sections[0].columns.map((c) => c.length)).toEqual([5, 0, 0]);
    expect(designSchema.safeParse(d3).success).toBe(true);
  });
});
