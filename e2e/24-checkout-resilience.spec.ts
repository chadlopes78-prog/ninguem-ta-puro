// Checkout com tráfego de anúncios (sessão 22): browser do Facebook/Instagram, resposta perdida (a página recarrega
// enquanto o comprador confirma no telemóvel) e rede lenta. Fornecedor de pagamentos de TESTE.
// Corre depois de 19 ("Guia PDF E2E" publicado).
import { expect, test, type Page } from "@playwright/test";
import { login, noHorizontalScroll, toPaymentPage } from "./helpers";

const FB_UA = "Mozilla/5.0 (Linux; Android 12; SM-A125F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.163 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/442.0.0.33.113;]";
let checkoutPath = "";

async function fill(page: Page, phone: string) {
  await page.getByLabel("Nome completo").fill("Cliente do Anúncio");
  await page.getByLabel("Email").fill("anuncio@exemplo.co.mz");
  await page.getByLabel(/Número M-Pesa/).fill(phone);
}
const keyOf = (body: string | null) => /"idempotencyKey":"([0-9a-f]+)"/.exec(body ?? "")?.[1] ?? null;

test.describe.serial("checkout com tráfego de anúncios", () => {
  test("link do anúncio (UTM/fbclid) no browser do Facebook: abre, imagem otimizada, compra e página de pagamento", async ({ browser }) => {
    const admin = await browser.newPage();
    await login(admin);
    await admin.goto("/produtos");
    await admin.locator("table").getByRole("link", { name: /Guia PDF E2E/ }).first().click();
    checkoutPath = new URL((await admin.getByTestId("product-checkout-url").textContent())!.trim()).pathname;
    await admin.close();

    const ctx = await browser.newContext({ userAgent: FB_UA, viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": "41.220.10.1" } });
    const page = await ctx.newPage();
    await page.goto(`${checkoutPath}?utm_source=facebook&utm_medium=cpc&utm_campaign=lancamento&fbclid=IwAR0teste`);
    await expect(page.getByText(/MZN/).first()).toBeVisible();
    // imagens da biblioteca servidas redimensionadas (nunca o original de vários MB)
    const imgs = await page.evaluate(() => [...document.images].map((i) => i.currentSrc));
    for (const src of imgs.filter((s) => s.includes("/api/public/media/"))) expect(src).toMatch(/\?w=\d+/);
    await noHorizontalScroll(page);
    await fill(page, "84 777 1113");
    await page.getByRole("button", { name: /Pagar agora|Finalizar compra/ }).tap();
    await toPaymentPage(page);
    await ctx.close();
  });

  test("resposta perdida e página recarregada: um novo clique reutiliza a mesma tentativa (sem segunda cobrança)", async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: FB_UA, viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": "41.220.10.2" } });
    const page = await ctx.newPage();
    const keys: string[] = [];
    let dropFirst = true;
    await page.route(`**${checkoutPath}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const k = keyOf(route.request().postData());
      if (k) keys.push(k);
      if (dropFirst) {
        dropFirst = false;
        await route.fetch(); // o servidor recebe e regista a compra…
        return route.abort("connectionreset"); // …mas a resposta não chega ao telemóvel
      }
      return route.continue();
    });
    await page.goto(checkoutPath);
    await fill(page, "84 777 2223");
    await page.getByRole("button", { name: /Pagar agora|Finalizar compra/ }).tap();
    await expect(page.getByRole("alert").filter({ hasText: "não será cobrado duas vezes" })).toBeVisible();
    // a WebView do Facebook recarrega a página
    await page.reload();
    await fill(page, "84 777 2223");
    await page.getByRole("button", { name: /Pagar agora|Finalizar compra/ }).tap();
    await toPaymentPage(page);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
    // depois da resposta, a tentativa deixa de estar guardada (uma compra nova usa uma chave nova)
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ntp:co-attempt:")).length)).toBe(0);
    await ctx.close();
  });

  test("rede lenta: o botão mostra o processamento, não aceita cliques repetidos e explica a demora", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": "41.220.10.3" } });
    const page = await ctx.newPage();
    let posts = 0;
    await page.route(`**${checkoutPath}`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posts++;
      await new Promise((r) => setTimeout(r, 12_000));
      return route.continue();
    });
    await page.goto(checkoutPath);
    await fill(page, "84 777 3333");
    const btn = page.locator("form button[type=submit]");
    await btn.tap();
    await expect(btn).toBeDisabled();
    await btn.tap({ force: true }).catch(() => undefined);
    await expect(page.getByTestId("awaiting-phone").or(page.getByTestId("slow-connection")).first()).toBeVisible({ timeout: 15_000 });
    await toPaymentPage(page);
    expect(posts).toBe(1);
    await ctx.close();
  });
});
