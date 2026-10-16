// Entrega do produto (PDF ou link) no formulário do produto, entrega depois do pagamento, área "Os meus produtos",
// recuperação do acesso e aba Integrações organizada (configurações existentes preservadas).
// Corre no fim (depois de 07 e 17: credenciais E2Payments e Pixel já guardados). Pagamentos pelo fornecedor de TESTE.
import { expect, test, type Page } from "@playwright/test";
import { completeAndPublish, login, noHorizontalScroll, toast } from "./helpers";

const PDF = Buffer.from("%PDF-1.4\n% guia e2e\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF");
let pdfProductUrl = "";
let pdfCheckout = "";

let buyer = 0;
async function buy(page: Page, path: string, phone: string, email = "entrega@exemplo.co.mz") {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.19.0.${++buyer}` });
  await page.goto(path);
  await page.getByLabel("Nome completo").fill("Comprador Entrega");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Número M-Pesa/).fill(phone);
  await page.getByRole("button", { name: /Pagar agora|Finalizar compra/ }).click();
}

test.describe.serial("entrega do produto e integrações", () => {
  test("Integrações: cartões com estado; credenciais e Pixel existentes preservados; ativar/desativar no cartão", async ({ page }) => {
    await login(page);
    await page.goto("/integracoes");
    // E2Payments guardada em 07: continua configurada (com erro de ligação neste ambiente)
    await expect(page.getByTestId("integration-e2payments").getByTestId("integration-status")).toHaveText("Erro de configuração");
    await page.getByTestId("configure-e2payments").click();
    await expect(page.getByText("Guardado: ••••0001. Deixe vazio para manter.")).toBeVisible();
    await expect(page.getByLabel("ID da carteira M-Pesa")).toHaveValue("123456");
    // Pixel guardado em 17 (desativado no fim): ativar e desativar a partir do cartão, sem perder nada
    await page.goto("/integracoes");
    const meta = page.getByTestId("integration-meta");
    await expect(meta).toContainText("1 Pixel(s) · 1 produto(s)");
    await expect(meta.getByTestId("integration-status")).toHaveText("Inativa");
    await meta.getByTestId("toggle-meta").click();
    await toast(page, "Pixel da Meta ativado");
    await expect(meta.getByTestId("integration-status")).toHaveText("Ativa");
    await meta.getByTestId("toggle-meta").click();
    await page.getByRole("dialog").getByRole("button", { name: "Desativar" }).click();
    await toast(page, "Pixel da Meta desativado");
    await expect(meta.getByTestId("integration-status")).toHaveText("Inativa");
    await page.getByTestId("configure-meta").click();
    await expect(page.getByTestId("meta-pixel-123456789012345")).toContainText("Desativado · 1 produto(s)");
    // registo de integrações recolhido por omissão
    await page.goto("/integracoes");
    await expect(page.getByTestId("integration-logs")).not.toHaveAttribute("open", "");
    await noHorizontalScroll(page);
  });

  test("criar produto PDF: ficheiro carregado do dispositivo, guardado e associado; persiste depois de recarregar", async ({ page }) => {
    await login(page);
    await page.goto("/produtos/novo");
    await page.getByLabel("Nome do produto").fill("Guia PDF E2E");
    await page.getByLabel("Descrição").fill("Guia em PDF entregue automaticamente depois do pagamento.");
    await page.getByLabel("Preço principal").fill("120,00");
    await page.getByLabel("Tipo").selectOption("EBOOK");
    await expect(page.getByText("Como o cliente vai receber este produto?")).toBeVisible();
    await page.getByTestId("delivery-choice-file").click();
    await expect(page.getByTestId("delivery-access-url")).toHaveCount(0); // sem URL como método principal
    // formato errado: mensagem clara
    await page.getByTestId("delivery-file-input").setInputFiles({ name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("texto") });
    await expect(page.getByTestId("delivery-file-error")).toContainText("Formato não suportado");
    await page.getByTestId("delivery-file-input").setInputFiles({ name: "Guia E2E.pdf", mimeType: "application/pdf", buffer: PDF });
    await expect(page.getByTestId("delivery-file-name")).toHaveText("Guia E2E.pdf");
    await page.getByRole("button", { name: "Guardar produto" }).click();
    await expect(page).toHaveURL(/\/produtos\/[a-z0-9]+\?criado=1$/, { timeout: 20_000 });
    pdfProductUrl = new URL(page.url()).pathname;
    pdfCheckout = new URL((await page.getByTestId("product-checkout-url").textContent())!.trim()).pathname;
    await page.reload();
    await expect(page.getByTestId("delivery-choice-file")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("delivery-file-name")).toHaveText("Guia E2E.pdf");
    await expect(page.getByTestId("req-deliveryContent")).toHaveAttribute("data-ok", "true");
    // substituir no produto existente (guardado logo)
    await page.getByTestId("delivery-file-replace").setInputFiles({ name: "Guia E2E v2.pdf", mimeType: "application/pdf", buffer: PDF });
    await toast(page, "Ficheiro guardado");
    await page.reload();
    await expect(page.getByTestId("delivery-file-name")).toHaveText("Guia E2E v2.pdf");
  });

  test("criar produto SaaS com link de acesso validado (sem PDF)", async ({ page }) => {
    await login(page);
    await page.goto("/produtos/novo");
    await page.getByLabel("Nome do produto").fill("App SaaS E2E");
    await page.getByLabel("Descrição").fill("Ferramenta online com acesso imediato depois do pagamento.");
    await page.getByLabel("Preço principal").fill("300,00");
    await page.getByLabel("Tipo").selectOption("DIGITAL");
    await page.getByTestId("delivery-choice-link").click();
    await expect(page.getByTestId("delivery-file-input")).toHaveCount(0);
    await page.getByTestId("delivery-access-url").fill("meusite/app");
    await expect(page.getByTestId("delivery-access-invalid")).toBeVisible();
    await page.getByRole("button", { name: "Guardar produto" }).click();
    await expect(page.getByText("Link inválido").first()).toBeVisible();
    await page.getByTestId("delivery-access-url").fill("https://app.exemplo.co.mz/entrar");
    await expect(page.getByTestId("delivery-access-test")).toHaveAttribute("href", "https://app.exemplo.co.mz/entrar");
    await page.getByRole("button", { name: "Guardar produto" }).click();
    await expect(page).toHaveURL(/\/produtos\/[a-z0-9]+\?criado=1$/, { timeout: 20_000 });
    await page.reload();
    await expect(page.getByTestId("delivery-choice-link")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("delivery-access-url")).toHaveValue("https://app.exemplo.co.mz/entrar");
  });

  test("compra: só depois do pagamento confirmado aparece “Descarregar produto”; área de acesso e recuperação", async ({ page, request }) => {
    await login(page);
    await page.goto(pdfProductUrl);
    await page.getByTestId("complete-setup").click();
    await page.getByTestId("create-wizard-funnel").click();
    await completeAndPublish(page, "Guia PDF E2E", { fromWizard: true, keepDelivery: true });

    // pendente (termina em 3): sem botão de download
    await buy(page, pdfCheckout, "84 777 1113");
    await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "pending", { timeout: 30_000 });
    const pendingToken = page.url().split("/").pop()!;
    await page.goto(`/obrigado/${pendingToken}`);
    await expect(page.getByTestId("thank-you-button")).toHaveCount(0);

    // pago (termina em 1)
    await buy(page, pdfCheckout, "84 777 2221", "recupera@exemplo.co.mz");
    await expect(page).toHaveURL(/\/obrigado\//, { timeout: 45_000 });
    await expect(page.getByTestId("thank-you-product-name")).toContainText("Guia PDF E2E");
    const btn = page.getByTestId("thank-you-button");
    await expect(btn).toHaveText(/Descarregar produto/);
    const href = (await btn.getAttribute("href"))!;
    expect(href).toMatch(/^\/acesso\/[A-Za-z0-9_-]+\/ficheiro\/[a-z0-9]+$/);
    const dl = await request.get(href);
    expect(dl.status()).toBe(200);
    expect(dl.headers()["content-type"]).toBe("application/pdf");
    expect(dl.headers()["cache-control"]).toBe("private, no-store");
    // sem o token pessoal o ficheiro não existe
    expect((await request.get(href.replace(/\/acesso\/[^/]+\//, "/acesso/naoexistenaoexistenaoexiste1234/"))).status()).toBe(404);
    const code = /NTP-[A-Z0-9]{8}/.exec((await page.getByTestId("thank-you-summary").textContent())!)![0];

    // área "Os meus produtos"
    await page.getByTestId("thank-you-access-area").getByRole("link", { name: "Os meus produtos" }).click();
    await expect(page.getByRole("heading", { name: "Os seus produtos" })).toBeVisible();
    await expect(page.getByTestId("access-product")).toHaveCount(1);
    await expect(page.getByTestId("access-product")).toContainText("Guia PDF E2E");
    await expect(page.getByTestId("delivery-link")).toHaveText(/Descarregar produto/);
    const areaUrl = page.url();
    await noHorizontalScroll(page);

    // recuperação: email + código (e dados errados não revelam nada)
    await page.setExtraHTTPHeaders({});
    await page.goto("/acesso");
    await page.getByTestId("recover-email").fill("recupera@exemplo.co.mz");
    await page.getByTestId("recover-code").fill("NTP-ERRADO99");
    await page.getByTestId("recover-submit").click();
    await expect(page.getByTestId("recover-error")).toContainText("Não encontrámos");
    await page.getByTestId("recover-code").fill(code);
    await page.getByTestId("recover-submit").click();
    await expect(page.getByTestId("recover-results")).toContainText("Guia PDF E2E");
    await page.getByTestId("recover-open").click();
    expect(page.url()).toBe(areaUrl);
    await expect(page.getByTestId("access-product")).toContainText("Guia PDF E2E");
  });

  test("telemóvel: entrega no formulário, área de acesso e recuperação sem deslocamento horizontal", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page);
    await page.goto(pdfProductUrl);
    await page.getByTestId("product-delivery").scrollIntoViewIfNeeded();
    await noHorizontalScroll(page);
    await page.goto("/integracoes");
    await noHorizontalScroll(page);
    await page.goto("/integracoes/meta");
    await noHorizontalScroll(page);
    await page.goto("/acesso");
    await noHorizontalScroll(page);
    await ctx.close();
  });
});
