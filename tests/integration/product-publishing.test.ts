// Publicação obrigatoriamente validada (funil, página de obrigado, suporte WhatsApp, entrega), entrega ligada
// ao produto comprado, configurações pessoais e recuperação da palavra-passe. Pagamentos pelo fornecedor de TESTE.
import { createHmac } from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { resetTestDb, testOwner, testSeller } from "../helpers/db";
import { productSchema } from "@/server/validation/schemas";
import { createProduct, getProduct, publishProduct, setProductStatus, updateProduct } from "@/server/services/products";
import { getReadiness, PublishBlockedError } from "@/server/services/product-readiness";
import { createWizardFunnel, saveWizardFunnel } from "@/server/services/funnel-wizard";
import { getDeliveryPageView } from "@/server/services/delivery";
import { getThankYouView, nextDestination } from "@/server/services/post-purchase";
import { submitCheckout } from "@/server/services/purchase";
import { saveProductPdf, fileForBuyer } from "@/server/services/product-files";
import { handleWebhook } from "@/server/payments/webhooks";
import { testLocalProvider } from "@/server/payments/providers/test-local";
import { getSettings, updateAccountSettings } from "@/server/services/settings";
import { createResetLinkForUser, requestPasswordReset, resetPassword, checkResetToken } from "@/server/auth/password-reset";
import { login } from "@/server/auth/service";
import { defaultThankYouDesign } from "@/lib/thank-you";
import { isValidDeliveryUrl, normalizeWhatsApp } from "@/lib/product-setup";
import { scopeOf, type Scope } from "@/server/scope";
import type { AuthUser } from "@/server/auth/service";

const SECRET = "segredo-apenas-para-testes";
beforeAll(() => {
  process.env.NTP_ENABLE_TEST_PROVIDER = "true";
  process.env.TEST_PROVIDER_SECRET = SECRET;
});
afterAll(() => {
  delete process.env.NTP_ENABLE_TEST_PROVIDER;
  delete process.env.TEST_PROVIDER_SECRET;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

let A: AuthUser, B: AuthUser;
let SA: Scope, SB: Scope;
beforeEach(async () => {
  await resetTestDb();
  A = await testOwner();
  B = await testSeller("vendedor.b@ex.co.mz", "Vendedor B");
  SA = scopeOf(A.id, false);
  SB = scopeOf(B.id, false);
});

let seq = 0;
const key = () => `idem${Date.now()}${seq++}abcdefgh`;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
const input = (over: Record<string, unknown> = {}) => productSchema.parse({ name: "Curso Completo", description: "Curso digital para testes de publicação.", type: "COURSE", priceCents: "300,00", currency: "MZN", status: "DRAFT", ...over });
const missingKeys = async (id: string, s: Scope) => (await getReadiness(id, s)).missing.map((m) => m.key);
const wizard = (productId: string, over: Record<string, unknown> = {}) => ({
  name: "Funil do curso",
  productId,
  afterPayment: "thank_you",
  thankYou: { design: defaultThankYouDesign(), fileId: null },
  support: { phone: "+258 84 123 4567", message: "Olá!" },
  delivery: { method: "EXTERNAL_LINK", url: "https://membros.exemplo.co.mz/curso" },
  ...over,
});
const buy = (slug: string) => submitCheckout(slug, { name: "Ana Compradora", email: "ana@exemplo.co.mz", phone: "841234567", method: "mpesa", idempotencyKey: key() });
async function pay(token: string) {
  const o = await prisma.order.findUniqueOrThrow({ where: { publicToken: token }, include: { payments: true } });
  const p = o.payments[0];
  const raw = JSON.stringify({ eventId: `ev_${p.id}`, externalId: p.externalId, reference: p.idempotencyKey, status: "paid", amountCents: p.amountCents, currency: "MZN", feeCents: 0 });
  expect((await handleWebhook(testLocalProvider, raw, new Headers({ "x-test-signature": createHmac("sha256", SECRET).update(raw).digest("hex") }))).status).toBe(200);
}

describe("1–7, 14. publicação só com a configuração obrigatória (validação no servidor)", () => {
  it("1. o produto é criado como rascunho, mesmo que o pedido peça 'publicado'", async () => {
    const p = await createProduct(input({ status: "PUBLISHED" }), SA);
    expect((await getProduct(p.id, SA)).status).toBe("DRAFT");
    const r = await getReadiness(p.id, SA);
    expect(r.ready).toBe(false);
    expect(r.stage).toBe("draft");
  });

  it("2–6. funil, página de obrigado e WhatsApp são opcionais; só a entrega bloqueia a publicação", async () => {
    const p = await createProduct(input(), SA);
    // sem entrega: bloqueado, e só a entrega falta (nunca funil, obrigado ou WhatsApp)
    expect(await missingKeys(p.id, SA)).toEqual(["delivery", "deliveryContent"]);
    await expect(publishProduct(p.id, SA)).rejects.toBeInstanceOf(PublishBlockedError);
    expect((await getProduct(p.id, SA)).status).toBe("DRAFT");
    // funil guardado sem WhatsApp nem entrega: continua a faltar só a entrega
    const f = await createWizardFunnel(p.id, SA);
    expect(await saveWizardFunnel(f.id, wizard(p.id, { support: { phone: "" }, delivery: { method: null } }), SA)).toMatchObject({ ok: true });
    expect(await missingKeys(p.id, SA)).toEqual(["delivery", "deliveryContent"]);
    // com entrega e sem WhatsApp: publica
    expect(await saveWizardFunnel(f.id, wizard(p.id, { support: { phone: "" } }), SA)).toMatchObject({ ok: true });
    expect(await missingKeys(p.id, SA)).toEqual([]);
    await publishProduct(p.id, SA);
    expect((await getProduct(p.id, SA)).status).toBe("PUBLISHED");
  });

  it("5. número WhatsApp inválido é rejeitado; 7. link externo inválido é rejeitado", async () => {
    const p = await createProduct(input(), SA);
    const f = await createWizardFunnel(p.id, SA);
    for (const phone of ["12", "abc", "+258 84", "0000"]) {
      const r = await saveWizardFunnel(f.id, wizard(p.id, { support: { phone } }), SA);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.fieldErrors?.["support.phone"]).toBeTruthy();
    }
    expect(normalizeWhatsApp("+258 84 123 4567")).toBe("258841234567");
    expect(normalizeWhatsApp("84 123 4567")).toBe("258841234567");
    for (const url of ["javascript:alert(1)", "ftp://x.co/a", "https://semdominio", "minha-area.com", "https://a.co/<script>"]) {
      expect(isValidDeliveryUrl(url)).toBe(false);
      const r = await saveWizardFunnel(f.id, wizard(p.id, { delivery: { method: "EXTERNAL_LINK", url } }), SA);
      expect(r.ok).toBe(false);
    }
    // nada inválido ficou guardado
    const stored = await prisma.product.findUniqueOrThrow({ where: { id: p.id } });
    expect(stored.supportWhatsApp).toBeNull();
    expect(stored.deliveryUrl).toBeNull();
  });

  it("14. chamadas diretas aos serviços (formulário, mudar estado, publicar) não publicam um produto incompleto", async () => {
    const p = await createProduct(input(), SA);
    // editar com status PUBLISHED: guarda o resto mas recusa publicar
    await expect(updateProduct(p.id, input({ name: "Curso Renomeado", status: "PUBLISHED" }), SA)).rejects.toBeInstanceOf(PublishBlockedError);
    const after = await getProduct(p.id, SA);
    expect(after).toMatchObject({ name: "Curso Renomeado", status: "DRAFT" });
    await expect(setProductStatus(p.id, "PUBLISHED", SA)).rejects.toBeInstanceOf(PublishBlockedError);
    await expect(publishProduct(p.id, SA)).rejects.toBeInstanceOf(PublishBlockedError);
    expect((await getProduct(p.id, SA)).status).toBe("DRAFT");
    // o checkout de um produto não publicado não aceita compras
    expect((await buy(p.primaryCheckout.slug!)).kind).toBe("unavailable");
  });

  it("produto completo: fica 'pronto para publicar' e a publicação ativa o funil principal no checkout", async () => {
    const p = await createProduct(input(), SA);
    const f = await createWizardFunnel(p.id, SA);
    expect(await saveWizardFunnel(f.id, wizard(p.id), SA)).toMatchObject({ ok: true });
    const r = await getReadiness(p.id, SA);
    expect(r).toMatchObject({ ready: true, stage: "ready", missing: [] });
    await publishProduct(p.id, SA);
    expect((await getProduct(p.id, SA)).status).toBe("PUBLISHED");
    expect((await getReadiness(p.id, SA)).stage).toBe("published");
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: p.primaryCheckout.id } })).funnelId).toBe(f.id);
    // produto publicado: o WhatsApp é opcional, mas a entrega não pode ser apagada
    expect((await saveWizardFunnel(f.id, wizard(p.id, { support: { phone: "" } }), SA)).ok).toBe(true);
    expect((await saveWizardFunnel(f.id, wizard(p.id, { delivery: { method: null } }), SA)).ok).toBe(false);
  });
});

describe("8–12, 15–17. entrega ligada ao produto comprado", () => {
  async function publishedWith(delivery: object, opts: { pdf?: boolean } = {}) {
    const p = await createProduct(input(), SA);
    const f = await createWizardFunnel(p.id, SA);
    const pdf = opts.pdf ? await saveProductPdf(p.id, SA, { name: "Manual.pdf", type: "application/pdf", bytes: PDF }) : null;
    const d = typeof delivery === "function" ? (delivery as (id: string | null) => object)(pdf?.id ?? null) : delivery;
    expect(await saveWizardFunnel(f.id, wizard(p.id, { delivery: d }), SA)).toMatchObject({ ok: true });
    await publishProduct(p.id, SA);
    return { p, pdf };
  }

  it("8, 15–16. link externo: só depois da confirmação do pagamento o cliente vê o WhatsApp e o acesso ao URL", async () => {
    const { p } = await publishedWith({ method: "EXTERNAL_LINK", url: "https://membros.exemplo.co.mz/curso" });
    const r = await buy(p.primaryCheckout.slug!);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    const pending = (await getThankYouView(r.token))!;
    expect(pending).toMatchObject({ state: "pending", button: null, support: null }); // 16. nada confirmado
    expect(await nextDestination(r.token)).toBeNull();
    await pay(r.token); // 15. fluxo de pagamento continua funcional
    expect(await nextDestination(r.token)).toEqual({ kind: "thank_you", url: `/obrigado/${r.token}` });
    const ty = (await getThankYouView(r.token))!;
    expect(ty.state).toBe("confirmed");
    expect(ty.support?.href).toBe("https://wa.me/258841234567?text=Ol%C3%A1!");
    expect(ty.button).toEqual({ label: "Aceder ao meu produto", href: "https://membros.exemplo.co.mz/curso", external: true });
  });

  it("9–11, 17. página interna: criada e guardada; WhatsApp + ACEDER AO MEU PRODUTO ligado ao ficheiro real", async () => {
    const { p, pdf } = await publishedWith((fileId: string | null) => ({ method: "INTERNAL_PAGE", page: { title: "Bem-vindo ao curso", welcome: "Obrigado!", instructions: "Descarregue o manual.", bodyText: "", buttonText: "ACEDER AO MEU PRODUTO", resourceUrl: "", fileId } }), { pdf: true });
    const page = await prisma.deliveryPage.findUniqueOrThrow({ where: { productId: p.id } });
    expect(page).toMatchObject({ title: "Bem-vindo ao curso", fileId: pdf!.id }); // 9
    const r = await buy(p.primaryCheckout.slug!);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    await pay(r.token);
    const ty = (await getThankYouView(r.token))!;
    const token = (await prisma.delivery.findFirstOrThrow({ where: { order: { publicToken: r.token } } })).token;
    expect(ty.button).toEqual({ label: "Aceder ao meu produto", href: `/entrega/${token}/${p.id}`, external: false });
    const v = (await getDeliveryPageView(token, p.id))!;
    expect(v.support).toBe("https://wa.me/258841234567?text=Ol%C3%A1!"); // 10 (ordem verificada no E2E)
    expect(v.access).toEqual({ kind: "file", href: `/acesso/${token}/ficheiro/${pdf!.id}`, external: false }); // 11
    expect(v.buttonText).toBe("ACEDER AO MEU PRODUTO");
    const file = await fileForBuyer(token, pdf!.id); // 17. entrega real do ficheiro
    expect(Buffer.from(file!.data).equals(PDF)).toBe(true);
  });

  it("11. página interna com conteúdo ou link: o botão leva ao conteúdo/recurso real; sem conteúdo não publica", async () => {
    const p = await createProduct(input(), SA);
    const f = await createWizardFunnel(p.id, SA);
    expect(await saveWizardFunnel(f.id, wizard(p.id, { delivery: { method: "INTERNAL_PAGE", page: { title: "Acesso", bodyText: "" } } }), SA)).toMatchObject({ ok: true });
    expect(await missingKeys(p.id, SA)).toEqual(["deliveryContent"]);
    expect(await saveWizardFunnel(f.id, wizard(p.id, { delivery: { method: "INTERNAL_PAGE", page: { title: "Acesso", bodyText: "Aula 1: introdução. Código: NTP-2026." } } }), SA)).toMatchObject({ ok: true });
    await publishProduct(p.id, SA);
    const r = await buy(p.primaryCheckout.slug!);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    await pay(r.token);
    const token = (await prisma.delivery.findFirstOrThrow({ where: { order: { publicToken: r.token } } })).token;
    expect((await getDeliveryPageView(token, p.id))!.access).toEqual({ kind: "content", href: "#conteudo", external: false });
  });

  it("12. manipulação de IDs: o acesso de uma compra não abre a entrega de outro produto nem de outra conta", async () => {
    const { p } = await publishedWith({ method: "INTERNAL_PAGE", page: { title: "Acesso", bodyText: "Conteúdo privado do produto A." } });
    const other = await createProduct(input({ name: "Outro Curso" }), SA);
    const r = await buy(p.primaryCheckout.slug!);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    const token = (await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token }, include: { delivery: true } })).delivery?.token;
    expect(token).toBeUndefined(); // sem pagamento confirmado não há acesso
    await pay(r.token);
    const t = (await prisma.delivery.findFirstOrThrow({ where: { order: { publicToken: r.token } } })).token;
    expect(await getDeliveryPageView(t, other.id)).toBeNull(); // produto não comprado
    const foreign = await createProduct(input({ name: "Produto de B" }), SB);
    expect(await getDeliveryPageView(t, foreign.id)).toBeNull(); // outra conta
    expect(await getDeliveryPageView("x".repeat(32), p.id)).toBeNull(); // token inventado
    expect(await getDeliveryPageView(t, "../../etc/passwd")).toBeNull();
    // reembolso revoga o acesso
    await prisma.order.update({ where: { publicToken: r.token }, data: { status: "REFUNDED" } });
    expect(await getDeliveryPageView(t, p.id)).toBeNull();
  });
});

describe("13. isolamento entre contas", () => {
  it("um funil de outra conta não pode ser usado nem associado", async () => {
    const pa = await createProduct(input(), SA);
    const pb = await createProduct(input({ name: "Produto B" }), SB);
    const fb = await createWizardFunnel(pb.id, SB);
    // A não consegue guardar nem associar o funil de B (nem o seu produto ao funil de B)
    await expect(saveWizardFunnel(fb.id, wizard(pa.id), SA)).rejects.toThrow("não encontrado");
    const fa = await createWizardFunnel(pa.id, SA);
    const r = await saveWizardFunnel(fa.id, wizard(pb.id), SA);
    expect(r.ok).toBe(false);
    // mesmo forçando na base de dados, um funil de outra conta não conta como funil associado nem é ativado
    await prisma.product.update({ where: { id: pa.id }, data: { mainFunnelId: fb.id, supportWhatsApp: "258841234567", deliveryMethod: "EXTERNAL_LINK", deliveryUrl: "https://a.exemplo.co.mz/x" } });
    expect((await getReadiness(pa.id, SA)).mainFunnelId).toBeNull();
    await publishProduct(pa.id, SA); // modo simples: publica sem funil
    expect((await prisma.checkout.findUniqueOrThrow({ where: { id: pa.primaryCheckout.id } })).funnelId).toBeNull();
    expect((await prisma.funnel.findUniqueOrThrow({ where: { id: fb.id } })).status).not.toBe("ACTIVE");
    // B não vê os requisitos de A
    await expect(getReadiness(pa.id, SB)).rejects.toThrow("não encontrado");
  });
});

describe("18. dados históricos", () => {
  it("publicar, despublicar e configurar não altera vendas existentes; produtos antigos publicados continuam a vender", async () => {
    const legacy = await createProduct(input({ name: "Produto Antigo" }), SA);
    // produto publicado antes desta funcionalidade (sem funil/WhatsApp/entrega): mantém-se publicado e a vender
    await prisma.product.update({ where: { id: legacy.id }, data: { status: "PUBLISHED" } });
    expect((await getReadiness(legacy.id, SA)).stage).toBe("published_incomplete");
    const r = await buy(legacy.primaryCheckout.slug!);
    if (r.kind !== "payment_started") throw new Error(r.kind);
    await pay(r.token);
    const before = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token }, include: { payments: true, items: true } });
    await setProductStatus(legacy.id, "UNPUBLISHED", SA);
    // depois de despublicado, só volta a publicar quando estiver completo
    await expect(setProductStatus(legacy.id, "PUBLISHED", SA)).rejects.toBeInstanceOf(PublishBlockedError);
    const f = await createWizardFunnel(legacy.id, SA);
    expect(await saveWizardFunnel(f.id, wizard(legacy.id), SA)).toMatchObject({ ok: true });
    await publishProduct(legacy.id, SA);
    const after = await prisma.order.findUniqueOrThrow({ where: { publicToken: r.token }, include: { payments: true, items: true } });
    expect(after).toEqual(before);
  });
});

describe("19. configurações pessoais", () => {
  it("nome, idioma, moeda padrão e fuso horário são guardados; os preços existentes não mudam", async () => {
    const p = await createProduct(input(), SA);
    await updateAccountSettings(A.id, { name: "Chad Lopes", locale: "pt-PT", defaultCurrency: "MZN", timezone: "Europe/Lisbon" });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: A.id } })).name).toBe("Chad Lopes");
    expect(await getSettings(A.id)).toMatchObject({ locale: "pt-PT", defaultCurrency: "MZN", timezone: "Europe/Lisbon" });
    expect((await getProduct(p.id, SA)).offers[0]).toMatchObject({ priceCents: 30000, currency: "MZN" });
    // as configurações de outra conta não mudam
    expect(await getSettings(B.id)).toMatchObject({ locale: "pt-MZ", defaultCurrency: "MZN", timezone: "Africa/Maputo" });
  });
});

describe("20. recuperação da palavra-passe", () => {
  it("token temporário de uso único: redefine, termina sessões e não revela se o email existe", async () => {
    const BASE = "https://ntp.exemplo";
    // sem email configurado: nada é enviado, a resposta é igual para emails existentes e inexistentes
    expect(await requestPasswordReset(A.email, BASE)).toEqual({ emailAvailable: false });
    expect(await requestPasswordReset("ninguem@ex.co.mz", BASE)).toEqual({ emailAvailable: false });
    expect(await prisma.passwordResetToken.count()).toBe(0);

    // com email configurado: envia o link (API da Resend simulada)
    process.env.RESEND_API_KEY = "re_teste_apenas";
    process.env.EMAIL_FROM = "Ninguém Tá Puro <nao-responder@ex.co.mz>";
    const sent: { to: string[]; text: string }[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      sent.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    });
    expect(await requestPasswordReset(A.email.toUpperCase(), BASE)).toEqual({ emailAvailable: true });
    expect(await requestPasswordReset("ninguem@ex.co.mz", BASE)).toEqual({ emailAvailable: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([A.email]);
    const token = /\/redefinir\/([A-Za-z0-9_-]+)/.exec(sent[0].text)![1];
    expect(await checkResetToken(token)).toBe(true);
    // só o hash é guardado
    expect(JSON.stringify(await prisma.passwordResetToken.findMany())).not.toContain(token);

    const session = await login(A.email, "password-123456");
    expect(session.ok).toBe(true);
    expect(await resetPassword(token, "nova-palavra-passe-2026")).toBe(true);
    expect(await prisma.session.count({ where: { userId: A.id } })).toBe(0); // sessões terminadas
    expect((await login(A.email, "password-123456")).ok).toBe(false);
    expect((await login(A.email, "nova-palavra-passe-2026")).ok).toBe(true);
    // uso único
    expect(await resetPassword(token, "outra-palavra-passe-1")).toBe(false);
    expect(await checkResetToken(token)).toBe(false);

    // expirado e inválido
    const link = await createResetLinkForUser(B.id, BASE, new Date(Date.now() - 31 * 60_000));
    const old = link.split("/").pop()!;
    expect(await resetPassword(old, "palavra-passe-expirada")).toBe(false);
    expect(await resetPassword("token-invalido", "palavra-passe-qualquer")).toBe(false);
    // limite de pedidos por conta (3 por hora; o link gerado pelo administrador acima também conta)
    for (let i = 0; i < 5; i++) await requestPasswordReset(B.email, BASE);
    expect(sent.filter((m) => m.to[0] === B.email)).toHaveLength(2);
  });
});
