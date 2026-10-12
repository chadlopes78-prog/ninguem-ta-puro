import { describe, expect, it } from "vitest";
import { checkoutSchema, productSchema, publicCheckoutSchema, setupSchema } from "@/server/validation/schemas";
import { flattenErrors } from "@/server/validation/common";

describe("productSchema", () => {
  const valid = { name: "Guia Digital de Exemplo", description: "Produto fictício utilizado para validar a interface.", type: "EBOOK", priceCents: "197,00", currency: "MZN", status: "DRAFT" };
  it("aceita o produto de exemplo e converte preço para cêntimos", () => {
    const r = productSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.priceCents).toBe(19700);
  });
  it("campos obrigatórios e mensagens", () => {
    const r = productSchema.safeParse({ name: "", description: "curta", type: "", priceCents: "abc", currency: "XYZ" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = flattenErrors(r.error);
      expect(Object.keys(e)).toEqual(expect.arrayContaining(["name", "description", "type", "priceCents", "currency"]));
    }
  });
  it("preço de referência deve ser maior que o preço", () => {
    expect(productSchema.safeParse({ ...valid, compareAtCents: "100,00" }).success).toBe(false);
    expect(productSchema.safeParse({ ...valid, compareAtCents: "297,00" }).success).toBe(true);
  });
  it("URL inválido é rejeitado", () => {
    expect(productSchema.safeParse({ ...valid, imageUrl: "javascript:alert(1)" }).success).toBe(false);
  });
});

describe("checkoutSchema", () => {
  it("cor inválida e telefone obrigatório implica recolha", () => {
    const base = { name: "C", productId: "p", offerId: "o", title: "Título", buttonText: "Comprar", primaryColor: "#C8F135", backgroundColor: "#000000", successTitle: "Ok", successMessage: "Ok" };
    expect(checkoutSchema.safeParse({ ...base, name: "Checkout", primaryColor: "red" }).success).toBe(false);
    const r = checkoutSchema.safeParse({ ...base, name: "Checkout", requirePhone: "on" });
    expect(r.success && r.data.collectPhone).toBe(true);
  });
});

describe("publicCheckoutSchema", () => {
  it("valida nome e email", () => {
    const r = publicCheckoutSchema({ requirePhone: false, requireDocument: false }).safeParse({ name: "A", email: "x" });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(flattenErrors(r.error))).toEqual(["name", "email"]);
  });
  it("telefone obrigatório quando configurado", () => {
    expect(publicCheckoutSchema({ requirePhone: true, requireDocument: false }).safeParse({ name: "Ana Silva", email: "a@b.pt" }).success).toBe(false);
    expect(publicCheckoutSchema({ requirePhone: true, requireDocument: false }).safeParse({ name: "Ana Silva", email: "a@b.pt", phone: "+351 912 345 678" }).success).toBe(true);
  });
  it("não existe nenhum campo de cartão no esquema", () => {
    const r = publicCheckoutSchema({ requirePhone: false, requireDocument: false }).safeParse({ name: "Ana Silva", email: "a@b.pt", cardNumber: "4111111111111111", cvv: "123" });
    expect(r.success && Object.keys(r.data)).not.toContain("cardNumber");
  });
});

describe("setupSchema", () => {
  it("passwords fortes e coincidentes", () => {
    expect(setupSchema.safeParse({ name: "Dono", email: "a@b.pt", password: "curta", confirm: "curta" }).success).toBe(false);
    expect(setupSchema.safeParse({ name: "Dono", email: "a@b.pt", password: "umapasswordlonga", confirm: "outra" }).success).toBe(false);
    expect(setupSchema.safeParse({ name: "Dono", email: "a@b.pt", password: "umapasswordlonga", confirm: "umapasswordlonga" }).success).toBe(true);
  });
});
