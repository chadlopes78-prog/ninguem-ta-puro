// Personalizar Checkout → Personalizar página de obrigado: editar, rascunho, publicar, compra de teste com a
// página personalizada e acesso real ao produto (PDF). Corre depois de 19 ("Guia PDF E2E" publicado, sem funil).
import { expect, test } from "@playwright/test";
import { login, noHorizontalScroll, toast, PAY_BUTTON } from "./helpers";

test.describe.serial("página de obrigado personalizada", () => {
  test("as duas opções; o editor do checkout continua a abrir", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts");
    await expect(page.getByTestId("tab-checkout")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("tab-obrigado")).toBeVisible();
    const card = page.getByTestId("personalization-card").filter({ hasText: "Guia PDF E2E" });
    await card.getByTestId("personalize").click();
    await expect(page.getByTestId("editor-preview")).toBeVisible();
    await page.goto("/checkouts");
    await page.getByTestId("tab-obrigado").click();
    await expect(page).toHaveURL(/\/checkouts\?tab=obrigado$/);
    await expect(page.getByTestId("personalization-card").filter({ hasText: "Guia PDF E2E" })).toContainText("Página padrão");
  });

  test("editar título, mensagem e botão; guardar rascunho; publicar; persiste depois de recarregar", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts?tab=obrigado");
    await page.getByTestId("personalization-card").filter({ hasText: "Guia PDF E2E" }).getByTestId("personalize-thank-you").click();
    await expect(page.getByTestId("thank-you-editor")).toBeVisible();
    await page.getByTestId("ty-name").fill("Obrigado — Guia");
    await page.getByTestId("ty-edit-title").fill("Obrigado pela tua compra!");
    await page.getByTestId("ty-edit-message").fill("A tua compra foi confirmada. Já podes aceder ao teu produto.");
    await page.getByTestId("ty-edit-button").fill("DESCARREGAR O MEU GUIA");
    const preview = page.getByTestId("ty-preview");
    await expect(preview.getByTestId("thank-you-title")).toHaveText("Obrigado pela tua compra!");
    await expect(preview.getByTestId("thank-you-button")).toContainText("DESCARREGAR O MEU GUIA");
    await page.getByTestId("ty-preview-mobile").click();
    await expect(preview).toHaveAttribute("data-device", "mobile");
    await page.getByTestId("ty-save-draft").click();
    await toast(page, "Rascunho guardado");
    await page.reload();
    await expect(page.getByTestId("ty-edit-title")).toHaveValue("Obrigado pela tua compra!");
    await expect(page.getByTestId("thank-you-status")).toHaveText("Alterações por publicar");
    await page.getByTestId("ty-publish").click();
    await toast(page, "Página de obrigado publicada");
    await page.reload();
    await expect(page.getByTestId("thank-you-status")).toHaveText("Publicada");
    await expect(page.getByTestId("ty-edit-button")).toHaveValue("DESCARREGAR O MEU GUIA");
  });

  test("compra de teste sem funil: pagamento confirmado → página personalizada com o botão do produto", async ({ page, request }) => {
    await login(page);
    await page.goto("/produtos");
    await page.locator("table").getByRole("link", { name: /Guia PDF E2E/ }).first().click();
    const checkout = new URL((await page.getByTestId("product-checkout-url").textContent())!.trim()).pathname;
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "10.20.0.1" });
    await page.goto(checkout);
    await page.getByLabel("Nome completo").fill("Comprador Obrigado");
    await page.getByLabel("Email").fill("obrigado@exemplo.co.mz");
    await page.getByLabel(/Número M-Pesa/).fill("84 888 1111");
    await page.getByRole("button", { name: PAY_BUTTON }).click();
    await expect(page).toHaveURL(/\/obrigado\//, { timeout: 45_000 });
    await expect(page.getByTestId("thank-you-title")).toHaveText("Obrigado pela tua compra!");
    const btn = page.getByTestId("thank-you-button");
    await expect(btn).toContainText("DESCARREGAR O MEU GUIA");
    const href = (await btn.getAttribute("href"))!;
    expect(href).toMatch(/^\/acesso\/[A-Za-z0-9_-]+\/ficheiro\/[a-z0-9]+$/);
    const dl = await request.get(href);
    expect(dl.status()).toBe(200);
    expect(dl.headers()["content-type"]).toBe("application/pdf");
    await noHorizontalScroll(page);
  });

  test("telemóvel: abas e editor sem deslocamento horizontal", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page);
    await page.goto("/checkouts?tab=obrigado");
    await noHorizontalScroll(page);
    await page.getByTestId("personalization-card").filter({ hasText: "Guia PDF E2E" }).getByTestId("personalize-thank-you").tap();
    await expect(page.getByTestId("thank-you-editor")).toBeVisible();
    await noHorizontalScroll(page);
    await ctx.close();
  });
});
