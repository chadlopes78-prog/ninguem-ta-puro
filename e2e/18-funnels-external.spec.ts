// Funis: páginas externas de upsell/downsell com o código de integração, página de obrigado externa,
// entrada única "Funil avançado" e mapa do fluxo. As páginas "externas" são servidas pelo próprio teste
// (interceção de https://paginas.exemplo.test) com o código copiado do editor. Corre depois de 08 e 16
// (funil do "Ebook Moçambique" com upsell + downsell). Pagamentos só pelo fornecedor de TESTE local.
import { expect, test, type Page } from "@playwright/test";
import { login, mzn, noHorizontalScroll, toast, toPaymentPage, PAY_BUTTON } from "./helpers";

const EXT = "https://paginas.exemplo.test";
let funnelUrl = "";
let snippet = "";

const APP = "http://localhost:3100";
/**
 * Serve as páginas "externas" em ${EXT}/ext/*. O Chromium de teste não deixa uma página https pública usar
 * recursos nem redirecionamentos para localhost (acesso à rede local), por isso, neste teste, o resto do domínio
 * externo encaminha para a aplicação (script, API, oferta, pagamento e obrigado), com os redirecionamentos
 * reescritos. Em produção o código de integração aponta para o domínio público da plataforma.
 */
async function serveExternal(page: Page) {
  await page.route(`${EXT}/**`, async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (!u.pathname.startsWith("/ext/")) {
      // as server actions do Next verificam a origem: o pedido encaminhado apresenta-se como vindo da aplicação
      const fwd = await req.allHeaders();
      if (fwd.origin) fwd.origin = APP;
      if (fwd.referer) fwd.referer = fwd.referer.split(EXT).join(APP);
      const res = await route.fetch({ url: req.url().replace(EXT, APP), headers: fwd, maxRedirects: 0 });
      const location = res.headers().location;
      if (res.status() >= 300 && res.status() < 400 && location) {
        // redirecionamento da plataforma: segue no navegador (novo pedido, também intercetado)
        const to = new URL(location, APP).toString().split(APP).join(EXT);
        return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: `<!doctype html><script>location.replace(${JSON.stringify(to)})</script>` });
      }
      return route.fulfill({ response: res });
    }
    const title = u.pathname.includes("downsell") ? "Página externa do downsell" : u.pathname.includes("obrigado") ? "Obrigado (página externa)" : "Página externa do upsell";
    const body = u.pathname.includes("obrigado") ? "" : snippet.split(APP).join(EXT);
    await route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${title}</title></head><body><h1>${title}</h1>${body}</body></html>` });
  });
}

let buyer = 0;
async function buyEbook(page: Page, phone: string) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.18.0.${++buyer}` });
  await page.goto("/checkout/ebook-mocambique");
  await page.getByLabel("Nome completo").fill("Comprador Externo");
  await page.getByLabel("Email").fill("externo@exemplo.co.mz");
  await page.getByLabel(/Número M-Pesa/).fill(phone);
  await page.getByRole("button", { name: PAY_BUTTON }).click();
  await toPaymentPage(page);
}

/**
 * Compra e segue para a página externa do upsell. O page.route não intercepta pedidos que resultam de um
 * redirecionamento (o servidor redireciona de /pagamento/… para a página externa): regista-se o destino escolhido
 * pelo servidor e abre-se essa página simulada.
 */
async function buyToExternalUpsell(page: Page, phone: string) {
  const toUpsell = page.waitForRequest((r) => /paginas\.exemplo\.test\/ext\/upsell\?.*ntp_run=/.test(r.url()), { timeout: 60_000 });
  await Promise.all([toUpsell, buyEbook(page, phone).catch(() => undefined)]);
  await page.goto((await toUpsell).url());
}

// páginas externas simuladas com page.route: sem service worker (os pedidos que ele trata não passam pelo page.route)
test.use({ serviceWorkers: "block" });

test.describe.serial("funis com páginas externas", () => {
  test("entrada única Funil avançado; mapa do funil; link da página e código de integração por etapa", async ({ page }) => {
    await login(page);
    await page.goto("/funis");
    await expect(page.getByRole("button", { name: "Funil avançado" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Criar funil", exact: true })).toHaveCount(0);
    // o cartão mostra a sequência real
    const card = page.locator("li").filter({ has: page.getByRole("link", { name: /Funil — Ebook Moçambique/ }) });
    await expect(card.getByTestId("funnel-card-flow")).toContainText("Downsell — Essencial");
    await card.getByRole("link", { name: /Funil — Ebook Moçambique/ }).click();
    await expect(page).toHaveURL(/\/funis\/[a-z0-9]+$/);
    funnelUrl = page.url();

    // upsell: página externa
    await page.getByTestId("map-offer-upsell").click();
    await page.getByTestId("offer-page-url").fill(`${EXT}/ext/upsell`);
    await page.getByTestId("offer-accept-text").fill("ACEITAR OFERTA");
    await page.getByTestId("offer-decline-text").fill("NÃO, OBRIGADO");
    const code = page.getByTestId("integration-code");
    await expect(code).toContainText("/ntp-funil.js");
    await expect(code).toContainText("#ntp-aceitar");
    await expect(code).toContainText("#ntp-recusar");
    snippet = (await code.locator("pre").textContent())!;
    expect(snippet).not.toMatch(/token|secret|sk_|EAA/i);
    // downsell: página externa
    await page.getByTestId("map-offer-downsell").click();
    await page.getByTestId("offer-page-url").fill(`${EXT}/ext/downsell`);
    await expect(page.getByTestId("map-offer-downsell")).toContainText("Página externa");
    await page.getByTestId("wizard-save").click();
    await toast(page, "Funil guardado");
    await page.reload();
    await page.getByTestId("map-offer-upsell").click();
    await expect(page.getByTestId("offer-page-url")).toHaveValue(`${EXT}/ext/upsell`);
    await expect(page.getByTestId("integration-code")).toBeVisible();
  });

  test("compra: página externa do upsell → recusar → downsell externo → aceitar → pagamento → obrigado (venda DOWNSELL)", async ({ page }) => {
    await serveExternal(page);
    // pagamento confirmado no servidor → página externa do upsell com o percurso e a etapa
    await buyToExternalUpsell(page, "84 600 1111");
    const up = new URL(page.url());
    expect(up.searchParams.get("ntp_step")).toBe("upsell");
    await expect(page.getByRole("heading", { name: "Página externa do upsell" })).toBeVisible();
    // recusar no botão da página externa → a plataforma decide o destino (downsell)
    await page.getByRole("link", { name: "NÃO, OBRIGADO" }).click();
    await page.waitForURL(/paginas\.exemplo\.test\/ext\/downsell\?.*ntp_step=downsell/);
    await expect(page.getByRole("heading", { name: "Página externa do downsell" })).toBeVisible();
    // aceitar → pagamento seguro na plataforma (o clique não é uma venda)
    await page.getByRole("link", { name: /ACEITAR|SIM, QUERO/ }).click();
    await page.waitForURL(/paginas\.exemplo\.test\/oferta\/[A-Za-z0-9]+$/);
    await expect(page.getByTestId("upsell-price")).toHaveText(mzn("99,00"));
    await page.getByTestId("upsell-accept").click();
    await expect(page).toHaveURL(/\/obrigado\//, { timeout: 45_000 });
    const summary = page.getByTestId("thank-you-summary");
    await expect(summary).toContainText("Ebook Moçambique");
    await expect(summary).toContainText("Guia Digital Renomeado");
    await expect(summary).toContainText(mzn("99,00"));
  });

  test("acesso direto: etapa não autorizada, percurso inventado e código fora do funil não fazem nada", async ({ page, request }) => {
    const js = await request.get("/ntp-funil.js");
    expect(js.status()).toBe(200);
    expect(js.headers()["content-type"]).toContain("javascript");
    expect(await js.text()).not.toMatch(/sk_|EAA|secret/i);
    const fake = await request.post("/api/public/funil/v1/aceitar", { form: { run: "abcdefghijklmnopqrst", step: "upsell" }, maxRedirects: 0 });
    expect(fake.status()).toBe(404);
    const bad = await request.post("/api/public/funil/v1/recusar", { form: { run: "<script>", step: "x" }, maxRedirects: 0 });
    expect(bad.status()).toBe(400);
    // página aberta sem ntp_run/ntp_step: os botões não executam nada
    await serveExternal(page);
    await page.goto(`${EXT}/ext/upsell`);
    await page.getByRole("link", { name: "ACEITAR OFERTA" }).click();
    await page.waitForTimeout(500);
    expect(new URL(page.url()).host).toBe("paginas.exemplo.test");
  });

  test("página de obrigado externa: desativar a do site envia para o endereço configurado, só com pagamento confirmado", async ({ page }) => {
    await login(page);
    await page.goto(funnelUrl);
    await page.getByTestId("map-thank-you").click();
    await page.getByTestId("ty-step-name").fill("Obrigado — página do site");
    await page.getByTestId("ty-use-site").uncheck();
    await expect(page.getByTestId("ty-external-note")).toBeVisible();
    await page.getByTestId("wizard-save").click();
    // sem endereço: erro claro
    await expect(page.getByText("Indique o endereço da página de obrigado externa").first()).toBeVisible();
    await page.getByTestId("ty-redirect").fill(`${EXT}/ext/obrigado`);
    await page.getByTestId("wizard-save").click();
    await toast(page, "Funil guardado");
    await page.reload();
    await expect(page.getByTestId("map-thank-you")).toContainText(`Externa: ${EXT}/ext/obrigado`);

    await serveExternal(page);
    await buyToExternalUpsell(page, "84 600 2221");
    await page.getByRole("link", { name: "NÃO, OBRIGADO" }).click();
    await page.waitForURL(/paginas\.exemplo\.test\/ext\/downsell\?/);
    await page.getByRole("link", { name: /NÃO, OBRIGADO|Não, obrigado/ }).click();
    await page.waitForURL(`${EXT}/ext/obrigado`);
    await expect(page.getByRole("heading", { name: "Obrigado (página externa)" })).toBeVisible();

    // repor a página do site (a página interna nunca foi apagada) e confirmar a pré-visualização
    await page.setExtraHTTPHeaders({});
    await page.goto(funnelUrl); // sessão do painel ainda ativa
    await page.getByTestId("map-thank-you").click();
    await page.getByTestId("ty-use-site").check();
    await page.getByTestId("ty-redirect").fill("");
    await expect(page.getByTestId("device-frame").getByTestId("thank-you-title")).toBeVisible();
    await page.getByTestId("wizard-save").click();
    await toast(page, "Funil guardado");
  });

  test("telemóvel: mapa e etapas do editor sem deslocamento horizontal", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page);
    await page.goto(funnelUrl);
    await noHorizontalScroll(page);
    await page.getByTestId("map-offer-upsell").tap();
    await expect(page.getByTestId("integration-code")).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByTestId("map-thank-you").tap();
    await expect(page.getByTestId("ty-step-name")).toBeVisible();
    await noHorizontalScroll(page);
    await ctx.close();
  });
});
