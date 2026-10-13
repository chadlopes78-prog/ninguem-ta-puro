// Funis reais no browser: assistente, pagamento confirmado → upsell → página de obrigado (WhatsApp/PDF),
// temas do checkout e do painel. Pagamentos pelo fornecedor de TESTE local (telefone terminado em 1 = pago na consulta).
// Corre depois de 02/05/06 (produtos "Ebook Moçambique" e "Guia Digital Renomeado").
import { expect, test, type Page } from "@playwright/test";
import { login, mzn, noHorizontalScroll, toast } from "./helpers";

let funnelUrl = "";

let buyer = 0;
async function buyEbook(page: Page, phone: string) {
  // cada compra simula um comprador diferente (o checkout limita 10 tentativas por IP em 10 minutos)
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.8.0.${++buyer}` });
  await page.goto("/checkout/ebook-mocambique");
  await page.getByLabel("Nome completo").fill("Comprador Funil");
  await page.getByLabel("Email").fill("funil@exemplo.co.mz");
  await page.getByLabel(/Número M-Pesa/).fill(phone);
  await page.getByRole("button", { name: "Pagar agora" }).click();
}

test.describe.serial("funis: upsell e página de obrigado", () => {
  test("assistente: produto inicial → upsell → página de obrigado com WhatsApp", async ({ page }) => {
    await login(page);
    await page.goto("/funis");
    await page.getByTestId("new-wizard-funnel").first().click();
    await page.getByRole("dialog").getByRole("combobox").selectOption({ label: "Ebook Moçambique" });
    await page.getByTestId("create-wizard-funnel").click();
    await expect(page).toHaveURL(/\/funis\/[a-z0-9]+$/);
    funnelUrl = page.url();

    // Etapa 1: produto com o checkout já existente
    const card = page.getByTestId("wizard-product-card");
    await expect(card).toContainText("Ebook Moçambique");
    await expect(card).toContainText(mzn("1250,00"));
    await expect(card).toContainText("/checkout/ebook-mocambique");

    // Etapa 2: depois do pagamento → upsell
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByTestId("after-upsell").click();
    await page.getByRole("button", { name: /Configurar upsell/ }).click();
    await expect(page.getByTestId("funnel-flow")).toContainText("Upsell");
    await page.getByTestId("upsell-product").selectOption({ label: "Guia Digital Renomeado" });
    await page.getByTestId("upsell-headline").fill("Leve também o Guia Digital");
    const preview = page.getByTestId("device-frame");
    await expect(preview.getByRole("heading", { name: "Leve também o Guia Digital" })).toBeVisible();
    await expect(preview.getByTestId("upsell-price")).toHaveText(mzn("247,90"));
    await page.getByTestId("preview-mobile").click();
    await expect(preview).toHaveAttribute("data-device", "mobile");

    // Etapa 3: página de obrigado → WhatsApp
    await page.getByRole("button", { name: "Página de obrigado" }).last().click();
    await page.getByTestId("action-whatsapp").click();
    await page.getByTestId("wa-phone").fill("84 123 4567");
    await expect(page.getByTestId("wa-preview")).toContainText("https://wa.me/258841234567?text=Ol%C3%A1!");
    await expect(page.getByTestId("thank-you-title")).toHaveText("Compra confirmada com sucesso!");
    await expect(page.getByTestId("thank-you-button")).toContainText("Falar connosco no WhatsApp");

    await page.getByTestId("wizard-activate").click();
    await toast(page, "Funil ativado");
    await expect(page.getByText("Ativo").first()).toBeVisible();
    await page.reload();
    await expect(page.getByTestId("funnel-flow")).toContainText("Upsell");
  });

  test("pagamento confirmado → upsell; recusar mantém a compra e leva à página de obrigado", async ({ page }) => {
    await buyEbook(page, "84 111 2221");
    // a página de estado só avança depois de o servidor confirmar o pagamento
    await expect(page).toHaveURL(/\/oferta\/[A-Za-z0-9]+/, { timeout: 45_000 });
    await expect(page.getByRole("heading", { name: "Leve também o Guia Digital" })).toBeVisible();
    await expect(page.getByTestId("upsell-price")).toHaveText(mzn("247,90"));
    await page.getByTestId("upsell-decline").click();
    await expect(page).toHaveURL(/\/obrigado\//);
    await expect(page.getByTestId("thank-you")).toHaveAttribute("data-state", "confirmed");
    await expect(page.getByTestId("thank-you-title")).toHaveText("Compra confirmada com sucesso!");
    await expect(page.getByTestId("thank-you-summary")).toContainText("Ebook Moçambique");
    const btn = page.getByTestId("thank-you-button");
    await expect(btn).toHaveText(/Falar connosco no WhatsApp/);
    await expect(btn).toHaveAttribute("href", /^https:\/\/wa\.me\/258841234567\?text=/);
  });

  test("aceitar o upsell cria um segundo pagamento; só depois de confirmado aparece na página de obrigado", async ({ page }) => {
    await buyEbook(page, "84 222 3331");
    await expect(page).toHaveURL(/\/oferta\//, { timeout: 45_000 });
    await page.getByTestId("upsell-accept").click(); // número em branco = o da compra (termina em 1 → confirmado)
    await expect(page).toHaveURL(/\/obrigado\//, { timeout: 45_000 });
    const summary = page.getByTestId("thank-you-summary");
    await expect(summary).toContainText("Ebook Moçambique");
    await expect(summary).toContainText("Guia Digital Renomeado");
    await expect(page.getByRole("link", { name: /Aceder: Guia Digital Renomeado/ })).toBeVisible();
  });

  test("página de obrigado com PDF protegido: só o comprador da encomenda paga descarrega", async ({ page, request }) => {
    await login(page);
    await page.goto(funnelUrl);
    await page.getByRole("button", { name: "Página de obrigado" }).first().click();
    await page.getByTestId("action-product").click();
    await page.getByRole("radio", { name: "Entregar um ficheiro PDF" }).click();
    await page.getByTestId("pdf-input").setInputFiles({ name: "Guia do comprador.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") });
    await toast(page, "PDF carregado");
    await expect(page.getByTestId("thank-you-button")).toContainText("Descarregar o meu produto");
    await page.getByTestId("wizard-save").click();
    await toast(page, "Funil guardado");

    await buyEbook(page, "84 333 4441");
    await expect(page).toHaveURL(/\/oferta\//, { timeout: 45_000 });
    await page.getByTestId("upsell-decline").click();
    await expect(page).toHaveURL(/\/obrigado\//);
    const href = (await page.getByTestId("thank-you-button").getAttribute("href"))!;
    expect(href).toMatch(/^\/acesso\/[A-Za-z0-9_-]+\/ficheiro\/[a-z0-9]+$/);
    const ok = await request.get(href);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("application/pdf");
    expect(ok.headers()["cache-control"]).toBe("private, no-store");
    expect((await ok.body()).subarray(0, 5).toString()).toBe("%PDF-");
    // token inventado não dá acesso
    const forged = await request.get(href.replace(/\/acesso\/[^/]+\//, "/acesso/naoexistenaoexistenaoexiste1234/"));
    expect(forged.status()).toBe(404);
  });

  test("compra pendente não mostra a confirmação nem o produto", async ({ page }) => {
    await buyEbook(page, "84 444 5553"); // termina em 3 → fica pendente
    await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "pending");
    const token = page.url().split("/").pop()!;
    await page.goto(`/obrigado/${token}`);
    await expect(page.getByTestId("thank-you")).toHaveAttribute("data-state", "pending");
    await expect(page.getByTestId("thank-you-title")).toHaveText("Estamos a confirmar o seu pagamento");
    await expect(page.getByTestId("thank-you-button")).toHaveCount(0);
  });

  test("tema do checkout: claro na pré-visualização e no checkout público; outros checkouts não mudam", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts");
    await page.getByTestId("personalization-card").filter({ hasText: "Ebook Moçambique" }).getByTestId("personalize").click();
    await page.getByRole("tab", { name: "Tema e cores" }).click();
    await page.getByTestId("checkout-theme-light").click();
    await expect(page.getByTestId("editor-preview").getByTestId("checkout-root")).toHaveAttribute("data-mode", "light");
    await page.getByTestId("publish").click();
    await toast(page, "Personalização publicada");
    await page.goto("/checkout/ebook-mocambique");
    await expect(page.getByTestId("checkout-root")).toHaveAttribute("data-mode", "light");
    await expect(page.getByLabel("Nome completo")).toBeVisible();
    await expect(page.getByText(mzn("1250,00")).first()).toBeVisible(); // preço inalterado
    await page.goto("/checkout/guia-digital-de-exemplo");
    await expect(page.getByTestId("checkout-root")).toHaveAttribute("data-mode", "dark");
  });

  test("tema do painel: alterna sem recarregar, fica guardado e não muda os checkouts públicos", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.getByTestId("theme-light").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    const bg = await page.evaluate(() => getComputedStyle(document.querySelector("[data-app-shell]")!).backgroundColor);
    expect(bg).toBe("rgb(244, 245, 247)");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(page.getByTestId("theme-light")).toHaveAttribute("aria-checked", "true");
    // checkout público escuro continua escuro com o painel em modo claro
    await page.goto("/checkout/guia-digital-de-exemplo");
    await expect(page.getByTestId("checkout-root")).toHaveAttribute("data-mode", "dark");
    const checkoutBg = await page.evaluate(() => getComputedStyle(document.querySelector("[data-testid=checkout-root]")!).backgroundColor);
    expect(checkoutBg).toBe("rgb(11, 12, 14)");
    await page.goto("/dashboard");
    await page.getByTestId("theme-dark").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("telemóvel: assistente e página de obrigado sem deslocamento horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.goto(funnelUrl);
    await expect(page.getByTestId("funnel-flow")).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Página de obrigado" }).first().click();
    await noHorizontalScroll(page);
    await buyEbook(page, "84 555 6661");
    await expect(page).toHaveURL(/\/oferta\//, { timeout: 45_000 });
    await noHorizontalScroll(page);
    await page.getByTestId("upsell-decline").click();
    await expect(page).toHaveURL(/\/obrigado\//);
    await noHorizontalScroll(page);
  });
});
