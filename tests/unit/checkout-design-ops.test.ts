import { describe, expect, it } from "vitest";
import { defaultDesign, designSchema, newElement, type CheckoutDesign } from "@/lib/checkout-design";
import { addSection, duplicateElement, duplicateSection, insertElement, locate, moveElement, moveSection, removeElement, removeSection, setSectionLayout } from "@/lib/checkout-design-ops";

const base = () => defaultDesign({ primaryColor: "#C8F135", backgroundColor: "#0B0C0E", buttonText: "Finalizar compra" });
const order = (d: CheckoutDesign, sid = "hero", col = 0) => d.sections.find((s) => s.id === sid)!.columns[col].map((e) => e.id);

describe("operações do editor visual", () => {
  it("o modelo padrão é válido e tem o formulário de compra exatamente uma vez", () => {
    const d = base();
    expect(designSchema.safeParse(d).success).toBe(true);
    // estrutura simples numa coluna: nome → imagem → preço → formulário (dados, pagamento, total, botão)
    expect(d.sections).toHaveLength(1);
    expect(d.sections[0].layout).toBe("1");
    expect(order(d)).toEqual(["product-name", "product-image", "product-price", "checkout"]);
  });

  it("inserir uma imagem acima do título e movê-la para baixo do título", () => {
    const img = newElement("image");
    let d = insertElement(base(), img, { sectionId: "hero", col: 0, index: 0 });
    expect(order(d)).toEqual([img.id, "product-name", "product-image", "product-price", "checkout"]);
    // arrastar para depois do título (posição 2 antes de remover → fica na 1)
    d = moveElement(d, img.id, { sectionId: "hero", col: 0, index: 2 });
    expect(order(d)).toEqual(["product-name", img.id, "product-image", "product-price", "checkout"]);
    // largar no mesmo sítio não muda nada
    expect(moveElement(d, img.id, { sectionId: "hero", col: 0, index: 1 })).toBe(d);
    expect(designSchema.safeParse(d).success).toBe(true);
  });

  it("mover entre colunas e secções; o formulário de compra pode mudar de posição", () => {
    let d = setSectionLayout(base(), "hero", "1-1");
    d = moveElement(d, "product-price", { sectionId: "hero", col: 1, index: 0 });
    expect(order(d, "hero", 1)).toEqual(["product-price"]);
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
    expect(order(d)[1]).toBe(r.newId);
    d = removeElement(d, r.newId!);
    expect(order(d)).toEqual(base().sections[0].columns[0].map((e) => e.id));
    const s1 = addSection(d, "1-1", 0);
    d = moveSection(s1.design, s1.section.id, 2);
    expect(d.sections.map((s) => s.id)).toEqual(["hero", s1.section.id]);
  });

  it("reduzir colunas não perde elementos", () => {
    const two = setSectionLayout(base(), "hero", "1-1");
    const moved = moveElement(two, "checkout", { sectionId: "hero", col: 1, index: 0 });
    const d = setSectionLayout(moved, "hero", "1");
    expect(d.sections[0].columns).toHaveLength(1);
    expect(order(d)).toEqual(["product-name", "product-image", "product-price", "checkout"]);
    const d3 = setSectionLayout(d, "hero", "1-1-1");
    expect(d3.sections[0].columns.map((c) => c.length)).toEqual([4, 0, 0]);
    expect(designSchema.safeParse(d3).success).toBe(true);
  });
});

describe("estrutura simplificada, estilo padrão e cronómetro", () => {
  it("só os 9 elementos simples podem ser adicionados; produto, preço e formulário são protegidos", async () => {
    const { ADDABLE_ELEMENTS, isProtectedElement } = await import("@/lib/checkout-design");
    expect(ADDABLE_ELEMENTS).toEqual(["heading", "text", "image", "banner", "countdown", "benefits", "testimonials", "guarantee", "spacer"]);
    const els = base().sections[0].columns[0];
    expect(els.filter(isProtectedElement).map((e) => e.id)).toEqual(["product-name", "product-price", "checkout"]);
    expect(isProtectedElement(newElement("heading"))).toBe(false);
  });

  it("restaurar estilo padrão repõe cores e estilos mas mantém textos, imagens e ordem", async () => {
    const { restoreDefaultStyle } = await import("@/lib/checkout-design");
    const cd = { ...(newElement("countdown") as Extract<ReturnType<typeof newElement>, { type: "countdown" }>), bgColor: "#DC2626", textColor: "#FFFF00", size: "lg" as const };
    let d = insertElement(base(), cd, { sectionId: "hero", col: 0, index: 0 });
    d = {
      ...d,
      theme: { ...d.theme, primaryColor: "#FF0000", buttonColor: "#0000FF", textColor: "#123456", countdownColor: "#00FF00" },
      sections: d.sections.map((s) => ({ ...s, columns: s.columns.map((c) => c.map((e) => (e.id === "product-name" ? { ...e, style: { fontSize: 50, color: "#FF5500", hideMobile: true } } : e))) })),
    };
    const r = restoreDefaultStyle(d);
    // o modelo padrão é claro: restaurar repõe as cores do tema claro
    expect(r.theme).toMatchObject({ mode: "light", primaryColor: "#16A34A", backgroundColor: "#F6F7F9", buttonColor: "", textColor: "", countdownColor: "", buttonText: "Finalizar compra" });
    expect(order(r)).toEqual(order(d));
    const name = locate(r, "product-name")!.el;
    expect(name.style).toEqual({ hideMobile: true }); // a visibilidade é uma escolha de conteúdo, mantém-se
    expect(locate(r, cd.id)!.el).toMatchObject({ title: cd.title, bgColor: "", textColor: "", size: "md" });
    expect(designSchema.safeParse(r).success).toBe(true);
  });

  it("designs guardados antes desta versão continuam válidos (cronómetro e tema ganham predefinições)", () => {
    const old = JSON.parse(JSON.stringify(base()));
    delete old.theme.buttonColor;
    delete old.theme.textColor;
    delete old.theme.countdownColor;
    old.sections[0].columns[0].push({ id: "cd1", type: "countdown", style: { background: "#DC2626" }, title: "Termina em", mode: "evergreen", endsAt: "", minutes: 15, expiredText: "" });
    const parsed = designSchema.parse(old);
    expect(parsed.theme.buttonColor).toBe("");
    expect(locate(parsed, "cd1")!.el).toMatchObject({ bgColor: "", textColor: "", size: "md" });
  });
});

describe("modelo padrão", () => {
  it("cores de fábrica → tema claro (fundo cinza-claro, botão verde); cores escolhidas pelo vendedor são respeitadas", () => {
    expect(base().theme).toMatchObject({ mode: "light", primaryColor: "#16A34A", backgroundColor: "#F6F7F9" });
    const own = defaultDesign({ primaryColor: "#FF5500", backgroundColor: "#101820", buttonText: "Comprar" });
    expect(own.theme).toMatchObject({ primaryColor: "#FF5500", backgroundColor: "#101820", buttonText: "Comprar" });
    expect(own.theme.mode).toBeUndefined();
    expect(designSchema.safeParse(own).success).toBe(true);
    // estrutura: nome, imagem, preço e formulário, numa coluna
    expect(base().sections[0].columns[0].map((e) => e.type)).toEqual(["heading", "image", "price", "checkout"]);
  });
});
