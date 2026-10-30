// Checkout público renderizado (HTML do servidor): estrutura simples, total uma só vez, mensagem da EPay
// removida (E2Payments mantém o seu fluxo) e cronómetro com a cor em todo o componente.
import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined, refresh: () => undefined }) }));

const { CheckoutView } = await import("@/components/checkouts/checkout-view");
const { classicDesign, defaultDesign, newElement } = await import("@/lib/checkout-design");
type ViewData = import("@/components/checkouts/checkout-view").CheckoutViewData;
type Option = import("@/components/checkouts/checkout-view").CheckoutPaymentOption;

const EPAY: Option = { id: "epay", providerId: "epay", providerName: "EPay", label: "EPay", requiresPhone: false, hosted: { methodsLabel: "M-Pesa, e-Mola ou IZI", isTest: false } };
const E2P_MPESA: Option = { id: "e2payments:mpesa", providerId: "e2payments", providerName: "E2Payments", label: "M-Pesa", requiresPhone: true, hosted: null };
const OLD_EPAY_TEXT = ["Pagamento seguro com", "será encaminhado para a página de pagamento", "Esta página nunca pede dados de cartão", "A compra só fica concluída depois de o pagamento ser confirmado."];

function data(paymentOptions: Option[], extra: Partial<ViewData> = {}): ViewData {
  return {
    publicId: "produto-teste",
    title: "Produto teste",
    description: "Descrição do produto",
    imageUrl: null,
    buttonText: "Finalizar compra",
    primaryColor: "#C8F135",
    backgroundColor: "#0B0C0E",
    collectPhone: false,
    requirePhone: false,
    collectDocument: false,
    requireDocument: false,
    allowCoupons: false,
    supportEmail: null,
    productName: "Produto teste",
    offerName: "Preço principal",
    priceCents: 1000,
    compareAtCents: null,
    currency: "MZN",
    isDemo: false,
    businessName: "Ninguém Tá Puro",
    paymentOptions,
    ...extra,
  };
}
// formulário clássico (checkouts personalizados com o modelo anterior); o modelo padrão novo tem testes próprios
const render = (d: ViewData, design?: Parameters<typeof CheckoutView>[0]["design"]) => renderToStaticMarkup(createElement(CheckoutView, { data: d, design: design ?? classicDesign(d), mode: "live" }));
const renderDefault = (d: ViewData) => renderToStaticMarkup(createElement(CheckoutView, { data: d, mode: "live" }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ");
const count = (s: string, sub: string | RegExp) => (s.match(new RegExp(sub, "g")) ?? []).length;

describe("checkout simples: produto, preço e total sem repetições", () => {
  it("nome e preço aparecem no topo; o total aparece uma única vez e corresponde ao preço real", () => {
    const t = text(render(data([EPAY])));
    expect(count(t, "Produto teste")).toBe(1);
    expect(t).not.toContain("Preço principal");
    expect(count(t, "Total")).toBe(1);
    expect(count(t, "10,00")).toBe(2); // preço no topo + total junto ao botão
    // ordem: nome → preço → dados do comprador → pagamento → total → botão
    const at = (s: string) => t.indexOf(s);
    expect(at("Produto teste")).toBeLessThan(at("10,00"));
    expect(at("10,00")).toBeLessThan(at("Nome completo"));
    expect(at("Nome completo")).toBeLessThan(at("M-Pesa"));
    expect(at("M-Pesa")).toBeLessThan(at("Total"));
    expect(at("Total")).toBeLessThan(at("Finalizar compra"));
  });

  it("com cupão o resumo explica só o necessário (subtotal, desconto, total) — sem repetir o produto", () => {
    // o cupão é aplicado no browser; aqui confirma-se que, sem cupão, não há subtotal nem linha do produto
    const t = text(render(data([EPAY], { allowCoupons: true })));
    expect(t).not.toContain("Subtotal");
    expect(t).not.toContain("Produto teste · ");
  });

  it("sem imagem do produto não aparece nenhum marcador no lugar da imagem", () => {
    const html = render(data([EPAY]));
    expect(html).not.toContain('data-block="image"><figure');
    expect(html).not.toMatch(/>PT</); // iniciais do produto (marcador antigo)
  });
});

describe("mensagem da EPay", () => {
  it("EPay ativa (único gateway): a mensagem antiga desaparece; mostra só os métodos e permite pagar", () => {
    const html = render(data([EPAY]));
    const t = text(html);
    for (const m of OLD_EPAY_TEXT) expect(t).not.toContain(m);
    expect(html).toContain('data-testid="hosted-payment"');
    for (const m of ["M-Pesa", "e-Mola", "IZI"]) expect(t).toContain(m);
    expect(html).toMatch(/<button type="submit"[^>]*>Finalizar compra<\/button>/);
  });

  it("EPay em ambiente de teste: só um aviso curto", () => {
    const t = text(render(data([{ ...EPAY, hosted: { ...EPAY.hosted!, isTest: true } }])));
    expect(t).toContain("Ambiente de teste: nenhum dinheiro real é cobrado.");
    for (const m of OLD_EPAY_TEXT) expect(t).not.toContain(m);
  });

  it("E2Payments mantém o seu fluxo (aviso de confirmação no telemóvel e número para pagamento)", () => {
    const t = text(render(data([E2P_MPESA, EPAY])));
    expect(t).toContain("Receberá um pedido de confirmação no telemóvel");
    expect(t).toContain("Número M-Pesa para pagamento");
    expect(t).toContain("EPay — M-Pesa · e-Mola · IZI");
    expect(t).not.toContain("será encaminhado para a página de pagamento");
  });
});

describe("cronómetro", () => {
  const withCountdown = (cd: Record<string, unknown>, theme: Record<string, unknown> = {}) => {
    const d = classicDesign({ primaryColor: "#C8F135", backgroundColor: "#0B0C0E", buttonText: "Finalizar compra" });
    const el = { ...newElement("countdown"), ...cd };
    d.sections[0].columns[0].splice(3, 0, el as never);
    d.theme = { ...d.theme, ...theme };
    return render(data([EPAY]), d);
  };
  const box = (html: string) => /<div class="[^"]*"[^>]*style="([^"]*)"[^>]*data-testid="countdown"/.exec(html)?.[1] ?? "";
  const units = (html: string) => [...html.matchAll(/style="([^"]*)"[^>]*data-testid="countdown-unit"/g)].map((m) => m[1]);

  for (const [name, hex] of [["vermelho", "#DC2626"], ["azul", "#2563EB"], ["verde", "#16A34A"]]) {
    it(`${name}: a cor preenche todo o componente e as áreas internas; números e texto brancos`, () => {
      const html = withCountdown({ bgColor: hex });
      expect(box(html)).toContain(`background:${hex}`);
      expect(box(html)).toContain("color:#FFFFFF");
      const u = units(html);
      expect(u).toHaveLength(3);
      for (const s of u) expect(s).toContain(`color-mix(in srgb, #FFFFFF 14%, ${hex})`);
    });
  }

  it("cor muito clara: texto escuro para continuar legível; cor de texto escolhida é respeitada", () => {
    expect(box(withCountdown({ bgColor: "#FDE047" }))).toContain("color:#0A0B0D");
    expect(box(withCountdown({ bgColor: "#DC2626", textColor: "#FFFF00" }))).toContain("color:#FFFF00");
  });

  it("sem cor própria usa a cor do cronómetro do tema; a cor não passa para a caixa exterior nem para outros elementos", () => {
    const html = withCountdown({}, { countdownColor: "#2563EB" });
    expect(box(html)).toContain("background:#2563EB");
    // a caixa exterior do elemento não recebe fundo; o resto da página mantém as cores do tema
    expect(html).not.toMatch(/data-block="countdown"[^>]*style="[^"]*background/);
    expect(html).toMatch(/<button type="submit"[^>]*style="background:#16A34A/);
  });

  it("tamanho: classes de tamanho diferentes para pequeno e grande", () => {
    expect(withCountdown({ size: "sm" })).toContain("text-xl");
    expect(withCountdown({ size: "lg" })).toContain("text-3xl");
  });
});

describe("estilo global", () => {
  it("cor dos botões e dos textos do tema aplicam-se ao botão de compra e à página", () => {
    const d = classicDesign({ primaryColor: "#C8F135", backgroundColor: "#0B0C0E", buttonText: "Comprar" });
    d.theme = { ...d.theme, buttonColor: "#2563EB", textColor: "#F5F5F5" };
    const html = render(data([EPAY]), d);
    expect(html).toMatch(/<button type="submit"[^>]*style="background:#2563EB;color:#ffffff"/);
    expect(html).toContain("--ck-fg:#F5F5F5");
  });
});

describe("modelo padrão (PayGate)", () => {
  const E2P_EMOLA: Option = { id: "e2payments:emola", providerId: "e2payments", providerName: "E2Payments", label: "e-Mola", requiresPhone: true, hosted: null };
  it("estrutura da referência: cronómetro, selo seguro com o nome da loja, cartão do produto, formulário em cartão e botão fixo", () => {
    const html = renderDefault(data([E2P_MPESA, E2P_EMOLA]));
    const t = text(html);
    const at = (s: string) => t.indexOf(s);
    expect(t).toContain("OFERTA EXPIRA EM");
    expect(t).toContain("Checkout seguro · Ninguém Tá Puro");
    expect(at("OFERTA EXPIRA EM")).toBeLessThan(at("Checkout seguro"));
    expect(at("Checkout seguro")).toBeLessThan(at("Produto teste"));
    expect(at("Produto teste")).toBeLessThan(at("Dados do comprador"));
    expect(at("Dados do comprador")).toBeLessThan(at("Nome completo"));
    expect(at("Nome completo")).toBeLessThan(at("Número para fazer o pagamento"));
    expect(at("Número para fazer o pagamento")).toBeLessThan(at("Método de pagamento"));
    expect(t).toContain("Detectamos automaticamente M-Pesa ou e-Mola.");
    expect(t).toContain("Nunca partilhamos o seu número. Débito seguro e instantâneo.");
    expect(html).toContain('data-testid="phone-prefix"');
    expect(t).toContain("+258");
    // métodos em cartões com a operadora; o primeiro vem selecionado
    expect(t).toContain("Vodacom");
    expect(t).toContain("Movitel");
    expect(html).toMatch(/data-testid="method-mpesa" data-selected="true"/);
    // botão com o valor real e selos/consentimento
    expect(t).toContain("QUERO PAGAR 10,00 MZN AGORA");
    expect(count(html, 'data-testid="order-total"')).toBe(1);
    expect(t).toContain("Encriptado");
    expect(t).toContain("Ao pagar, autoriza o débito na sua carteira móvel.");
    expect(html).toContain('data-testid="sticky-pay-bar"');
    expect(html).toMatch(/aria-label="Ir para o pagamento — 10,00.MZN"/);
    // sem imagem do produto: o cartão mostra só nome e preço (sem área vazia)
    expect(html).not.toContain('data-testid="product-card-overlay"');
  });

  it("prova social só com dados reais: sem compras nem visitantes não aparece; com dados mostra os números verdadeiros", () => {
    expect(renderDefault(data([E2P_MPESA]))).not.toContain('data-testid="social-proof"');
    expect(renderDefault(data([E2P_MPESA], { socialProof: { purchases24h: 0, viewersNow: 1 } }))).not.toContain('data-testid="social-proof"');
    const t = text(renderDefault(data([E2P_MPESA], { socialProof: { purchases24h: 39, viewersNow: 3 } })));
    expect(t).toContain("39 pessoas compraram nas últimas 24h");
    expect(t).toContain("3 a ver agora");
  });

  it("avaliações vazias não aparecem (nada de testemunhos inventados); com avaliações reais mostra estrelas, comentário e nome", () => {
    const base = defaultDesign({ primaryColor: "#C8F135", backgroundColor: "#0B0C0E", buttonText: "Finalizar compra" });
    expect(renderToStaticMarkup(createElement(CheckoutView, { data: data([E2P_MPESA]), design: base, mode: "live" }))).not.toContain('data-testid="reviews"');
    const d = structuredClone(base);
    const rev = d.sections[0].columns[0].find((e) => e.type === "testimonials")!;
    if (rev.type === "testimonials") rev.items = [{ name: "Anselmo M.", text: "Paguei em segundos, recebi logo. Recomendo!", role: "", avatarUrl: "", rating: 5 }];
    const card = d.sections[0].columns[0].find((e) => e.type === "productCard")!;
    if (card.type === "productCard") card.overlayText = "15 mil meticais hoje";
    const html = renderToStaticMarkup(createElement(CheckoutView, { data: data([E2P_MPESA], { imageUrl: "https://exemplo.co.mz/p.jpg" }), design: d, mode: "live" }));
    expect(text(html)).toContain("“Paguei em segundos, recebi logo. Recomendo!”");
    expect(text(html)).toContain("— Anselmo M.");
    expect(html).toContain('data-testid="product-card-overlay"');
    expect(text(html)).toContain("15 mil meticais hoje");
  });

  it("checkouts com personalização publicada continuam com o seu próprio design (o modelo novo não os substitui)", () => {
    const html = render(data([E2P_MPESA]));
    expect(html).not.toContain('data-testid="sticky-pay-bar"');
    expect(html).not.toContain("OFERTA EXPIRA EM");
    expect(text(html)).toContain("Os seus dados");
  });
});
