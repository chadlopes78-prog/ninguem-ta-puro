// Geração automática do checkout por produto e personalização (rascunho/publicação).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { duplicateProduct, getProduct, setProductStatus, updateProduct } from "@/server/services/products";
import { createProduct, makeReady } from "../helpers/products";
import { deleteCheckout, duplicateCheckout, getPublicCheckout } from "@/server/services/checkouts";
import { backfillPrimaryCheckouts, checkoutPath, ensurePrimaryCheckout, slugify } from "@/server/services/primary-checkout";
import { discardDraft, getEditorState, listCheckoutPersonalization, publicDesign, publishDesign, saveDraft } from "@/server/services/checkout-design";
import { submitCheckout } from "@/server/services/purchase";
import { designSchema, newElement, type CheckoutDesign } from "@/lib/checkout-design";
import { insertElement } from "@/lib/checkout-design-ops";
import { newCheckoutPublicId } from "@/lib/ids";
import { scopeOf, type Scope } from "@/server/scope";
import type { AuthUser } from "@/server/auth/service";

const input = (over: Record<string, unknown> = {}) =>
  productSchema.parse({ name: "Handwriting Heroes", description: "Curso de caligrafia para crianças.", type: "DIGITAL", priceCents: "97", currency: "MZN", status: "PUBLISHED", ...over });

beforeAll(() => {
  process.env.NTP_ENABLE_TEST_PROVIDER = "true";
  process.env.TEST_PROVIDER_SECRET = "segredo-teste";
});
afterAll(() => {
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
});
let OWNER: AuthUser;
let S: Scope; // âmbito real da conta proprietária de teste
let D: Scope; // âmbito de demonstração da mesma conta
beforeEach(async () => {
  await resetTestDb();
  OWNER = await testOwner();
  S = scopeOf(OWNER.id, false);
  D = scopeOf(OWNER.id, true);
});

describe("1–4. checkout gerado automaticamente com o produto", () => {
  it("criar produto gera checkout principal, slug legível e link público que abre", async () => {
    const p = await createProduct(input(), S);
    expect(p.primaryCheckout).toMatchObject({ slug: "handwriting-heroes", primaryProductId: p.id, productId: p.id, offerId: p.offers[0].id, isActive: true, title: "Handwriting Heroes" });
    expect(checkoutPath(p.primaryCheckout)).toBe("/checkout/handwriting-heroes");
    const pub = await getPublicCheckout("handwriting-heroes");
    expect(pub.state).toBe("ok");
    if (pub.state === "ok") expect(pub.checkout).toMatchObject({ productId: p.id, offer: { priceCents: 9700, currency: "MZN" } });
    // o identificador aleatório continua a funcionar
    expect((await getPublicCheckout(p.primaryCheckout.publicId)).state).toBe("ok");
  });

  it("recarregar/voltar a garantir não muda nem duplica o link", async () => {
    const p = await createProduct(input(), S);
    for (let i = 0; i < 3; i++) {
      const c = await ensurePrimaryCheckout(p.id);
      expect(c.id).toBe(p.primaryCheckout.id);
      expect(c.slug).toBe("handwriting-heroes");
    }
    await Promise.all([ensurePrimaryCheckout(p.id), ensurePrimaryCheckout(p.id), ensurePrimaryCheckout(p.id)]);
    await updateProduct(p.id, input({ priceCents: "120" }), S);
    expect(await prisma.checkout.count({ where: { productId: p.id } })).toBe(1);
  });

  it("vários produtos (mesmo com nomes iguais) têm links próprios", async () => {
    const a = await createProduct(input(), S);
    const b = await createProduct(input(), S);
    const c = await createProduct(input({ name: "Ebook de Receitas" }), S);
    const slugs = [a, b, c].map((x) => x.primaryCheckout.slug);
    expect(new Set(slugs).size).toBe(3);
    expect(slugs).toEqual(["handwriting-heroes", "handwriting-heroes-2", "ebook-de-receitas"]);
    const pb = await getPublicCheckout("handwriting-heroes-2");
    expect(pb.state === "ok" && pb.checkout.productId).toBe(b.id);
  });

  it("slugify: acentos, símbolos e nomes curtos", () => {
    expect(slugify("Ação & Reação: Guia Nº 1!")).toBe("acao-reacao-guia-n-1");
    expect(slugify("  Café  ")).toBe("cafe");
    expect(slugify("!")).toMatch(/^produto-[a-z0-9]{6}$/);
  });

  it("produto duplicado recebe o seu próprio checkout", async () => {
    const p = await createProduct(input(), S);
    const copy = await duplicateProduct(p.id, S);
    const cc = await prisma.checkout.findUniqueOrThrow({ where: { primaryProductId: copy.id } });
    expect(cc.slug).toBe("handwriting-heroes-copia");
    expect(cc.id).not.toBe(p.primaryCheckout.id);
  });
});

describe("8. renomear não invalida links", () => {
  it("o slug mantém-se; título acompanha o nome enquanto não for personalizado", async () => {
    const p = await createProduct(input(), S);
    await updateProduct(p.id, input({ name: "Handwriting Heroes 2.0", description: "Nova descrição do curso." }), S);
    const c = await prisma.checkout.findUniqueOrThrow({ where: { primaryProductId: p.id } });
    expect(c.slug).toBe("handwriting-heroes");
    expect(c.title).toBe("Handwriting Heroes 2.0");
    expect(c.description).toBe("Nova descrição do curso.");
    expect((await getPublicCheckout("handwriting-heroes")).state).toBe("ok");
    // título personalizado manualmente não é sobrescrito
    await prisma.checkout.update({ where: { id: c.id }, data: { title: "Título à medida" } });
    await updateProduct(p.id, input({ name: "Outro nome", description: "Nova descrição do curso." }), S);
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: c.id } })).title).toBe("Título à medida");
  });
});

describe("5–7. personalização por produto, rascunho e publicação", () => {
  async function two() {
    const a = await createProduct(input(), S);
    const b = await createProduct(input({ name: "Outro Produto" }), S);
    return { a, b };
  }
  const els = (d: CheckoutDesign) => d.sections.flatMap((s) => s.columns.flat());
  const has = (d: CheckoutDesign, type: string) => els(d).some((x) => x.type === type);
  function withTestimonial(base: CheckoutDesign): CheckoutDesign {
    const d = insertElement(base, newElement("testimonials"), { sectionId: base.sections[0].id, col: 0, index: 0 });
    return { ...d, theme: { ...d.theme, primaryColor: "#FF5500", announcement: "Oferta de lançamento" } };
  }
  const without = (d: CheckoutDesign, type: string): CheckoutDesign => ({ ...d, sections: d.sections.map((s) => ({ ...s, columns: s.columns.map((c) => c.filter((x) => x.type !== type)) })) });

  it("sem personalização mostra o modelo padrão", async () => {
    const { a } = await two();
    const s = await getEditorState(a.id, S);
    expect(s.status).toBe("default");
    // modelo padrão profissional com dados reais do produto + formulário de compra protegido
    expect(els(s.draft).map((b) => b.type)).toEqual(["image", "heading", "text", "price", "checkout"]);
    expect(s.draft.sections[0].layout).toBe("3-2");
    // sem o selo "Compra segura" (removido a pedido do proprietário)
    expect(JSON.stringify(s.draft)).not.toContain("Compra segura");
    const pub = await getPublicCheckout("handwriting-heroes");
    if (pub.state !== "ok") throw new Error();
    expect(els(publicDesign(pub.checkout)).some((x) => x.type === "checkout")).toBe(true);
  });

  it("rascunho não substitui a versão publicada; publicar aplica ao checkout correto; outros não são afetados", async () => {
    const { a, b } = await two();
    const draft = withTestimonial((await getEditorState(a.id, S)).draft);
    expect(await saveDraft(a.id, draft, S)).toEqual({ ok: true });

    let pubA = await getPublicCheckout("handwriting-heroes");
    if (pubA.state !== "ok") throw new Error();
    expect(has(publicDesign(pubA.checkout), "testimonials")).toBe(false); // ainda não publicado
    expect((await getEditorState(a.id, S)).status).toBe("unpublished_changes");

    await publishDesign(a.id, S);
    pubA = await getPublicCheckout("handwriting-heroes");
    if (pubA.state !== "ok") throw new Error();
    const dA = publicDesign(pubA.checkout);
    expect(has(dA, "testimonials")).toBe(true);
    expect(dA.theme).toMatchObject({ primaryColor: "#FF5500", announcement: "Oferta de lançamento" });
    expect((await getEditorState(a.id, S)).status).toBe("published");

    const pubB = await getPublicCheckout("outro-produto");
    if (pubB.state !== "ok") throw new Error();
    expect(has(publicDesign(pubB.checkout), "testimonials")).toBe(false);
    expect(await prisma.checkoutDesign.count({ where: { checkout: { productId: b.id } } })).toBe(0);

    // novo rascunho após publicação: compradores continuam a ver a versão publicada
    await saveDraft(a.id, without(dA, "testimonials"), S);
    pubA = await getPublicCheckout("handwriting-heroes");
    if (pubA.state !== "ok") throw new Error();
    expect(has(publicDesign(pubA.checkout), "testimonials")).toBe(true);
    // descartar volta à versão publicada
    await discardDraft(a.id, S);
    expect(has((await getEditorState(a.id, S)).draft, "testimonials")).toBe(true);
    // o link não mudou
    expect((await ensurePrimaryCheckout(a.id)).slug).toBe("handwriting-heroes");
  });

  it("design inválido ou malicioso é rejeitado no servidor", async () => {
    const { a } = await two();
    const base = (await getEditorState(a.id, S)).draft;
    const checkoutEl = els(base).find((x) => x.type === "checkout")!;
    const withEl = (el: unknown) => ({ ...base, sections: [{ ...base.sections[0], columns: [[...base.sections[0].columns[0], el], base.sections[0].columns[1]] }] });
    const bad = [
      without(base, "checkout"), // sem formulário de compra
      withEl({ ...checkoutEl, id: "outro" }), // dois formulários
      { ...base, sections: base.sections.map((s) => ({ ...s, columns: s.columns.map((c) => c.map((x) => (x.type === "checkout" ? { ...x, style: { hideMobile: true } } : x))) })) }, // formulário oculto
      { ...base, theme: { ...base.theme, primaryColor: "red" } },
      withEl({ id: "v1", type: "video", style: {}, url: "https://malicioso.exemplo/x.mp4", caption: "" }),
      withEl({ id: "i1", type: "image", style: {}, src: "javascript:alert(1)" }),
      withEl({ id: "i2", type: "image", style: {}, src: "/api/public/media/../../etc" }),
      withEl({ id: "x", type: "script", code: "alert(1)" }),
      withEl({ id: "c1", type: "heading", style: { color: "red; background:url(https://x)" }, text: "t" }), // CSS livre
      withEl({ id: "c2", type: "text", style: { fontSize: 9999 }, text: "t" }),
      withEl({ id: "b1", type: "button", style: {}, label: "Pagar", action: "link", url: "javascript:alert(1)" }),
      { ...base, sections: [{ ...base.sections[0], layout: "1" }] }, // colunas incoerentes
    ];
    for (const d of bad) expect((await saveDraft(a.id, d, S)).ok).toBe(false);
    expect(designSchema.safeParse(withEl({ id: "v2", type: "video", style: {}, url: "https://youtu.be/dQw4w9WgXcQ", caption: "" })).success).toBe(true);
    // texto com HTML é guardado como texto simples (o React escapa-o ao mostrar; nunca é executado)
    expect(designSchema.safeParse(withEl({ id: "t1", type: "text", style: {}, source: "custom", text: "<script>alert(1)</script>" })).success).toBe(true);
  });
});

describe("9–10. preço e moeda do servidor; pagamento continua funcional", () => {
  it("o design não consegue alterar preço/moeda e a compra usa o preço da BD", async () => {
    const p = await createProduct(input({ priceCents: "250" }), S);
    const base = (await getEditorState(p.id, S)).draft;
    // campos comerciais injetados no design são descartados pela validação
    await saveDraft(p.id, { ...base, priceCents: 1, currency: "USD", theme: { ...base.theme, priceCents: 1 } }, S);
    await publishDesign(p.id, S);
    const stored = await prisma.checkoutDesign.findFirstOrThrow();
    expect(JSON.stringify(stored.published)).not.toContain("priceCents");
    expect(JSON.stringify(stored.published)).not.toContain("USD");

    const r = await submitCheckout("handwriting-heroes", { name: "Ana Comprador", email: "ana@exemplo.co.mz", phone: "841234567", method: "mpesa", idempotencyKey: "idem-personalizacao-0001", amountCents: "1" });
    expect(r.kind).toBe("payment_started");
    const order = await prisma.order.findFirstOrThrow({ include: { payments: true } });
    expect(order).toMatchObject({ totalCents: 25000, currency: "MZN", status: "PENDING", checkoutId: p.primaryCheckout.id });
    expect(order.payments[0]).toMatchObject({ amountCents: 25000, currency: "MZN" });
  });

  it("produtos não publicados ou arquivados não aceitam compras pelo link", async () => {
    const p = await createProduct(input({ status: "DRAFT" }), S);
    expect((await getPublicCheckout("handwriting-heroes")).state).toBe("unavailable");
    expect((await submitCheckout("handwriting-heroes", { name: "Ana Comprador", email: "a@b.co.mz" })).kind).toBe("unavailable");
    // sem a configuração obrigatória a publicação é recusada; depois de completa, publica
    await expect(setProductStatus(p.id, "PUBLISHED", S)).rejects.toThrow("Produto incompleto");
    await makeReady(p.id, S);
    await setProductStatus(p.id, "PUBLISHED", S);
    expect((await getPublicCheckout("handwriting-heroes")).state).toBe("ok");
    await setProductStatus(p.id, "ARCHIVED", S);
    expect((await getPublicCheckout("handwriting-heroes")).state).toBe("unavailable");
  });
});

describe("11. permissões e integridade", () => {
  it("âmbito (dados reais vs demonstração) é validado no servidor", async () => {
    const real = await createProduct(input(), S);
    await expect(getEditorState(real.id, D)).rejects.toThrow("não encontrado");
    expect((await saveDraft(real.id, (await getEditorState(real.id, S)).draft, S)).ok).toBe(true);
    await expect(saveDraft(real.id, (await getEditorState(real.id, S)).draft, D)).rejects.toThrow("não encontrado");
    await expect(publishDesign(real.id, D)).rejects.toThrow("não encontrado");
    expect((await listCheckoutPersonalization(D)).length).toBe(0);
    expect((await listCheckoutPersonalization(S)).map((x) => x.id)).toEqual([real.id]);
  });

  it("checkout principal não pode ser eliminado; duplicar cria checkout adicional sem roubar o link", async () => {
    const p = await createProduct(input(), S);
    await expect(deleteCheckout(p.primaryCheckout.id, S)).rejects.toThrow("checkout principal");
    const copy = await duplicateCheckout(p.primaryCheckout.id, S);
    expect(copy).toMatchObject({ slug: null, primaryProductId: null, productId: p.id });
    const pub = await getPublicCheckout("handwriting-heroes");
    expect(pub.state === "ok" && pub.checkout.id).toBe(p.primaryCheckout.id);
  });

  it("migração/recuperação: produtos antigos sem checkout ganham um; os que já tinham mantêm o link antigo", async () => {
    // produtos criados "à moda antiga" (sem checkout principal)
    const old1 = await prisma.product.create({ data: { name: "Produto Antigo", description: "Criado antes da funcionalidade", type: "EBOOK", status: "PUBLISHED", ownerId: OWNER.id, offers: { create: { name: "Preço principal", priceCents: 5000, currency: "MZN", isDefault: true } } }, include: { offers: true } });
    const old2 = await prisma.product.create({ data: { name: "Produto Com Link", description: "Já tinha um checkout partilhado", type: "EBOOK", status: "PUBLISHED", ownerId: OWNER.id, offers: { create: { name: "Preço principal", priceCents: 7000, currency: "MZN", isDefault: true } } }, include: { offers: true } });
    const legacyId = newCheckoutPublicId();
    await prisma.checkout.create({ data: { publicId: legacyId, name: "Antigo", productId: old2.id, offerId: old2.offers[0].id, title: "Antigo", ownerId: OWNER.id } });

    expect(await backfillPrimaryCheckouts()).toBe(2);
    expect(await backfillPrimaryCheckouts()).toBe(0); // idempotente
    const c1 = await prisma.checkout.findUniqueOrThrow({ where: { primaryProductId: old1.id } });
    expect(c1.slug).toBe("produto-antigo");
    const c2 = await prisma.checkout.findUniqueOrThrow({ where: { primaryProductId: old2.id } });
    expect(c2.publicId).toBe(legacyId); // o link antigo partilhado continua válido
    expect(c2.slug).toBe("produto-com-link");
    expect((await getPublicCheckout(legacyId)).state).toBe("ok");
    expect((await getPublicCheckout("produto-com-link")).state).toBe("ok");
    expect(await prisma.checkout.count({ where: { productId: old2.id } })).toBe(1);
    expect((await getProduct(old1.id, S)).id).toBe(old1.id);
  });

  it("slugs inválidos ou reservados não resolvem", async () => {
    expect((await getPublicCheckout("../etc/passwd")).state).toBe("unavailable");
    expect((await getPublicCheckout("Com-Maiusculas")).state).toBe("unavailable");
    expect((await getPublicCheckout("nao-existe")).state).toBe("unavailable");
  });
});

describe("designs da versão anterior (lista de blocos)", () => {
  it("são convertidos para secções sem perder conteúdo; o antigo selo 'Compra segura' sai do checkout público", async () => {
    const p = await createProduct(input(), S);
    const legacy = {
      theme: { primaryColor: "#FF5500", backgroundColor: "#0B0C0E", buttonText: "Comprar já", layout: "split", announcement: "Promoção" },
      blocks: [
        { id: "product", type: "product", showImage: true, headline: "Título antigo", subheadline: "" },
        { id: "t1", type: "testimonials", title: "Clientes", items: [{ name: "Marta", text: "Excelente", role: "", avatarUrl: "", rating: 5 }] },
        { id: "guarantee", type: "guarantee", title: "Compra segura", body: "O acesso é libertado assim que o pagamento for confirmado.", days: 0 },
        { id: "g2", type: "guarantee", title: "Garantia de 7 dias", body: "Devolvemos o dinheiro.", days: 7 },
      ],
    };
    await prisma.checkoutDesign.create({ data: { checkoutId: p.primaryCheckout.id, draft: legacy, published: legacy, publishedAt: new Date(), version: 1 } });
    const pub = await getPublicCheckout("handwriting-heroes");
    if (pub.state !== "ok") throw new Error();
    const d = publicDesign(pub.checkout);
    const all = d.sections.flatMap((s) => s.columns.flat());
    expect(d.version).toBe(2);
    expect(d.theme).toMatchObject({ primaryColor: "#FF5500", buttonText: "Comprar já", announcement: "Promoção" });
    expect(all.filter((x) => x.type === "checkout")).toHaveLength(1);
    expect(all.find((x) => x.type === "heading")).toMatchObject({ source: "custom", text: "Título antigo" });
    expect(all.some((x) => x.type === "testimonials")).toBe(true);
    expect(all.filter((x) => x.type === "guarantee").map((x) => (x as { title: string }).title)).toEqual(["Garantia de 7 dias"]);
    expect(JSON.stringify(d)).not.toContain("Compra segura");
    // o editor abre o design convertido e consegue guardá-lo no formato novo
    const st = await getEditorState(p.id, S);
    expect((await saveDraft(p.id, st.draft, S)).ok).toBe(true);
  });
});
