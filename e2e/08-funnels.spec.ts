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
    // o funil principal do Ebook foi criado ao completar a configuração (05); a lista mostra o estado de cada requisito
    const card = page.locator("li").filter({ has: page.getByRole("link", { name: /Funil — Ebook Moçambique/ }) });
    const status = card.getByTestId("funnel-card-status");
    await expect(status).toContainText("Ebook Moçambique");
    await expect(status).toContainText("Link externo");
    await expect(status).toContainText("Publicado");
    await card.getByRole("link", { name: /Funil — Ebook Moçambique/ }).click();
    await expect(page).toHaveURL(/\/funis\/[a-z0-9]+$/);
    funnelUrl = page.url();
    await expect(page.getByTestId("requirements-panel")).toContainText("7 de 7 concluídos");

    // Etapa 1: produto com o checkout já existente
    const productCard = page.getByTestId("wizard-product-card");
    await expect(productCard).toContainText("Ebook Moçambique");
    await expect(productCard).toContainText(mzn("1250,00"));
    await expect(productCard).toContainText("/checkout/ebook-mocambique");

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

    // Etapa 3: página de obrigado — botões fixos: WhatsApp (acima) + acesso ao produto
    await page.getByTestId("funnel-flow").getByRole("button", { name: /Página de obrigado/ }).click();
    await expect(page.getByTestId("thank-you-title")).toHaveText("Compra confirmada com sucesso!");
    await expect(page.getByTestId("thank-you-whatsapp")).toContainText("Precisa de ajuda? Fale connosco no WhatsApp");
    await expect(page.getByTestId("thank-you-button")).toContainText("Aceder ao meu produto");
    // Suporte WhatsApp: mensagem inicial e teste do link
    await page.getByTestId("funnel-flow").getByRole("button", { name: /Suporte WhatsApp/ }).click();
    await page.getByTestId("support-phone").fill("84 12");
    await expect(page.getByTestId("support-invalid")).toContainText("Número inválido");
    await page.getByTestId("support-phone").fill("84 123 4567");
    await page.getByLabel("Mensagem inicial (opcional)").fill("Olá! Preciso de ajuda.");
    await expect(page.getByTestId("support-test")).toHaveAttribute("href", "https://wa.me/258841234567?text=Ol%C3%A1!%20Preciso%20de%20ajuda.");

    await page.getByTestId("wizard-save").click();
    await toast(page, "Funil guardado");
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
    const wa = page.getByTestId("thank-you-whatsapp");
    const btn = page.getByTestId("thank-you-button");
    await expect(wa).toHaveAttribute("href", /^https:\/\/wa\.me\/258841234567\?text=/);
    await expect(btn).toHaveText(/Aceder ao meu produto/);
    await expect(btn).toHaveAttribute("href", "https://conteudo.exemplo.co.mz/ebook");
    expect((await wa.boundingBox())!.y).toBeLessThan((await btn.boundingBox())!.y);
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

  test("página de entrega interna com PDF protegido: WhatsApp acima de ACEDER AO MEU PRODUTO; só o comprador pago descarrega", async ({ page, request }) => {
    await login(page);
    await page.goto(funnelUrl);
    await page.getByTestId("funnel-flow").getByRole("button", { name: /Entrega do produto/ }).click();
    await page.getByTestId("delivery-internal").click();
    await page.getByTestId("delivery-page-title").fill("O seu ebook está pronto");
    await page.getByTestId("delivery-file-input").setInputFiles({ name: "Guia do comprador.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") });
    await toast(page, "PDF carregado");
    await expect(page.getByTestId("delivery-preview")).toContainText("ACEDER AO MEU PRODUTO");
    await page.getByTestId("wizard-save").click();
    await toast(page, "Funil guardado");

    await buyEbook(page, "84 333 4441");
    await expect(page).toHaveURL(/\/oferta\//, { timeout: 45_000 });
    await page.getByTestId("upsell-decline").click();
    await expect(page).toHaveURL(/\/obrigado\//);
    const href = (await page.getByTestId("thank-you-button").getAttribute("href"))!;
    expect(href).toMatch(/^\/entrega\/[A-Za-z0-9_-]+\/[a-z0-9]+$/);
    await page.getByTestId("thank-you-button").click();
    await expect(page.getByTestId("delivery-title")).toHaveText("O seu ebook está pronto");
    const wa = page.getByTestId("delivery-whatsapp");
    const access = page.getByTestId("delivery-access");
    await expect(wa).toHaveAttribute("href", /^https:\/\/wa\.me\/258841234567/);
    await expect(access).toHaveText(/ACEDER AO MEU PRODUTO/);
    expect((await wa.boundingBox())!.y).toBeLessThan((await access.boundingBox())!.y);
    const fileHref = (await access.getAttribute("href"))!;
    expect(fileHref).toMatch(/^\/acesso\/[A-Za-z0-9_-]+\/ficheiro\/[a-z0-9]+$/);
    const ok = await request.get(fileHref);
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("application/pdf");
    expect(ok.headers()["cache-control"]).toBe("private, no-store");
    expect((await ok.body()).subarray(0, 5).toString()).toBe("%PDF-");
    // token inventado ou produto trocado no URL não dão acesso
    expect((await request.get(fileHref.replace(/\/acesso\/[^/]+\//, "/acesso/naoexistenaoexistenaoexiste1234/"))).status()).toBe(404);
    await page.goto(href.replace(/[a-z0-9]+$/, "cl0000000000000000000000x"));
    await expect(page.getByRole("heading", { name: "Acesso indisponível" })).toBeVisible();
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
    await page.getByRole("button", { name: "Estilo do checkout" }).click();
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
