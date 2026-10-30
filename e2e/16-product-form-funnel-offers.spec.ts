// Formulário de produto simplificado (imagem carregada do dispositivo) e ofertas centralizadas nos funis
// (preço criado no funil, upsell + downsell). Corre no fim, com os dados dos testes anteriores.
// Pagamentos só pelo fornecedor de TESTE local (telefone terminado em 1 = pago na consulta).
import { expect, test, type Page } from "@playwright/test";
import { login, mzn, noHorizontalScroll, toast } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = (n: number) => ({ name: `foto-${n}.png`, mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.from([n])]) });
let productUrl = "";
let checkoutPath = "";

async function fieldsRemoved(page: Page) {
  const form = page.getByTestId("product-form");
  await expect(form).toBeVisible();
  // texto do formulário sem a nota que indica que as ofertas se configuram na aba Funis
  const text = await form.evaluate((f) => {
    const c = f.cloneNode(true) as HTMLElement;
    c.querySelector("[data-testid=funnel-offers-note]")?.remove();
    return c.innerText;
  });
  for (const gone of ["URL da imagem", "Preço de referência", "Configurações adicionais", "Página de vendas", "Ofertas e preços", "Nova oferta", "Upsell", "Downsell"]) expect(text).not.toContain(gone);
  await expect(page.getByTestId("funnel-offers-note")).toContainText("Funis");
  // sem URL de imagem: o único campo de endereço é o link de upsell (opcional)
  await expect(page.locator("input[type=url]:not([name=upsellUrl])")).toHaveCount(0);
  // ordem: nome → descrição → imagem → preço principal → guardar
  const y = async (sel: ReturnType<Page["locator"]>) => (await sel.boundingBox())!.y;
  expect(await y(page.getByLabel("Nome do produto"))).toBeLessThan(await y(page.getByLabel("Descrição")));
  expect(await y(page.getByLabel("Descrição"))).toBeLessThan(await y(page.getByTestId("product-image-field")));
  expect(await y(page.getByTestId("product-image-field"))).toBeLessThan(await y(page.getByLabel("Preço principal")));
  expect(await y(page.getByLabel("Preço principal"))).toBeLessThan(await y(page.getByRole("button", { name: "Guardar produto" })));
}

test.describe.serial("produto simples com imagem e ofertas nos funis", () => {
  test("1, 4–8. criar produto com imagem do dispositivo; só os campos essenciais; a imagem fica guardada", async ({ page }) => {
    await login(page);
    await page.goto("/produtos/novo");
    await fieldsRemoved(page);
    await page.getByLabel("Nome do produto").fill("Produto Com Foto");
    await page.getByLabel("Descrição").fill("Produto criado com uma fotografia carregada do dispositivo.");
    // ficheiro inválido: mensagem clara, nada é guardado
    await page.getByTestId("product-image-input").setInputFiles({ name: "notas.txt", mimeType: "text/plain", buffer: Buffer.from("isto não é uma imagem") });
    await expect(page.getByTestId("product-image-error")).toContainText("Formato não suportado");
    await page.getByTestId("product-image-input").setInputFiles(png(1));
    const preview = page.getByTestId("product-image-preview");
    await expect(preview).toHaveAttribute("src", /^\/api\/public\/media\/[a-z0-9]+$/);
    await expect(page.getByTestId("product-image-error")).toHaveCount(0);
    const first = await preview.getAttribute("src");
    await page.getByLabel("Preço principal").fill("150,00");
    await page.getByLabel("Tipo").selectOption("EBOOK");
    await page.getByRole("button", { name: "Guardar produto" }).click();
    await toast(page, "Produto criado");
    await expect(page).toHaveURL(/\/produtos\/[a-z0-9]+\?criado=1$/);
    productUrl = new URL(page.url()).pathname;
    checkoutPath = new URL((await page.getByTestId("product-checkout-url").textContent())!.trim()).pathname;
    await page.reload();
    await expect(page.getByTestId("product-image-preview")).toHaveAttribute("src", first!);
    expect(await page.getByTestId("product-image-preview").evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    await fieldsRemoved(page);
    await expect(page.getByText("Ofertas e preços")).toHaveCount(0);

    // 11. a foto aparece na lista de produtos e no checkout, com o preço correto (12.)
    await page.goto("/produtos");
    await expect(page.locator(`table img[src="${first}"]`).first()).toBeVisible();
    // produto rascunho: o checkout continua indisponível até estar completo (regra inalterada)
    await page.goto(checkoutPath);
    await expect(page.getByTestId("purchase-form")).toHaveCount(0);

    // produto publicado: a foto carregada pela edição aparece no checkout, com o preço inalterado
    await page.goto("/produtos");
    await page.locator("table").getByRole("link", { name: /Ebook Moçambique/ }).click();
    await page.getByTestId("product-image-input").setInputFiles(png(9));
    const ebookImg = await page.getByTestId("product-image-preview").getAttribute("src");
    await page.getByRole("button", { name: "Guardar produto" }).click();
    await toast(page, "Produto atualizado");
    await page.goto("/checkout/ebook-mocambique");
    // a mesma imagem, servida redimensionada no checkout (?w=…)
    const img = page.locator(`img[src^="${ebookImg}"]`).first();
    await expect(img).toBeVisible();
    expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    await expect(page.getByTestId("price")).toContainText(mzn("1250,00"));
    await expect(page.getByTestId("order-total")).toHaveText(mzn("1250,00"));
  });

  test("2–4. substituir e remover a imagem de um produto existente; persiste depois de recarregar", async ({ page }) => {
    await login(page);
    await page.goto(productUrl);
    const preview = page.getByTestId("product-image-preview");
    const before = await preview.getAttribute("src");
    await expect(page.getByTestId("product-image-upload")).toContainText("Substituir imagem");
    await page.getByTestId("product-image-input").setInputFiles(png(2));
    await expect(preview).not.toHaveAttribute("src", before!);
    const replaced = await preview.getAttribute("src");
    await page.getByRole("button", { name: "Guardar produto" }).click();
    await toast(page, "Produto atualizado");
    await page.reload();
    await expect(page.getByTestId("product-image-preview")).toHaveAttribute("src", replaced!);
    // remover
    await page.getByTestId("product-image-remove").click();
    await expect(page.getByTestId("product-image-preview")).toHaveCount(0);
    await page.getByRole("button", { name: "Guardar produto" }).click();
    await toast(page, "Produto atualizado");
    await page.reload();
    await expect(page.getByTestId("product-image-preview")).toHaveCount(0);
    await expect(page.getByTestId("product-image-upload")).toContainText("Carregar imagem");
    // preço inalterado
    await expect(page.getByLabel("Preço principal")).toHaveValue("150,00");
  });

  test("14. telemóvel: criar produto com foto por toque, sem deslocamento lateral", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page);
    await page.goto("/produtos/novo");
    await noHorizontalScroll(page);
    await page.getByLabel("Nome do produto").fill("Produto Foto Telemóvel");
    await page.getByLabel("Descrição").fill("Criado no telemóvel com uma fotografia da galeria.");
    await page.getByTestId("product-image-input").setInputFiles(png(3));
    await expect(page.getByTestId("product-image-preview")).toBeVisible();
    await page.getByLabel("Preço principal").fill("80,00");
    await page.getByLabel("Tipo").selectOption("PDF");
    await noHorizontalScroll(page);
    await page.getByRole("button", { name: "Guardar produto" }).tap();
    await toast(page, "Produto criado");
    await page.reload();
    await expect(page.getByTestId("product-image-preview")).toHaveAttribute("src", /^\/api\/public\/media\//);
    await noHorizontalScroll(page);
    await ctx.close();
  });

  test("9–10. funil: downsell ligado à recusa do upsell, com preço criado no próprio funil; o funil guarda e reabre", async ({ page }) => {
    await login(page);
    await page.goto("/funis");
    await page.getByRole("link", { name: /Funil — Ebook Moçambique/ }).first().click();
    await expect(page.getByTestId("map-offer-upsell")).toContainText("Guia Digital Renomeado"); // upsell existente preservado
    await page.getByTestId("add-downsell").click();
    await expect(page.getByTestId("downsell-step")).toBeVisible();
    // ligação habitual criada: recusar o upsell → downsell
    await expect(page.getByTestId("map-branches-upsell")).toContainText("Se recusar → Downsell 1");
    await page.getByTestId("offer-name").fill("Downsell — Essencial");
    await page.getByTestId("offer-product").selectOption({ label: "Guia Digital Renomeado" });
    // preço especial criado aqui (as ofertas deixaram de estar no formulário do produto)
    await page.getByTestId("offer-new-price-open").click();
    await page.getByTestId("offer-new-price-value").fill("99,00");
    await page.getByTestId("offer-new-price-save").click();
    await toast(page, "Preço criado");
    await expect(page.getByTestId("offer-price").locator("option:checked")).toContainText(mzn("99,00"));
    await expect(page.getByTestId("device-frame").getByTestId("upsell-price")).toHaveText(mzn("99,00"));
    await page.getByTestId("offer-accept-text").fill("SIM, QUERO O ESSENCIAL");
    await page.getByTestId("wizard-save").click();
    await toast(page, "Funil guardado");
    await page.reload();
    await expect(page.getByTestId("map-branches-upsell")).toContainText("Se recusar → Downsell — Essencial");
    await expect(page.getByTestId("map-branches-downsell")).toContainText("Se recusar → Página de obrigado");
    await page.getByTestId("map-offer-downsell").click();
    await expect(page.getByTestId("offer-accept-text")).toHaveValue("SIM, QUERO O ESSENCIAL");
  });

  test("10. compra real de teste: recusar o upsell mostra o downsell; aceitar cobra o preço do downsell", async ({ page }) => {
    await page.setExtraHTTPHeaders({ "x-forwarded-for": "10.16.0.1" });
    await page.goto("/checkout/ebook-mocambique");
    await expect(page.getByTestId("order-total")).toHaveText(mzn("1250,00")); // preço do checkout inalterado
    await page.getByLabel("Nome completo").fill("Comprador Downsell");
    await page.getByLabel("Email").fill("downsell@exemplo.co.mz");
    await page.getByLabel(/Número M-Pesa/).fill("84 555 6661");
    await page.getByRole("button", { name: "Pagar agora" }).click();
    await expect(page).toHaveURL(/\/oferta\//, { timeout: 45_000 });
    await expect(page.getByTestId("upsell-price")).toHaveText(mzn("247,90"));
    await page.getByTestId("upsell-decline").click();
    // mesma página de oferta, agora com o downsell
    await expect(page.getByTestId("upsell-price")).toHaveText(mzn("99,00"), { timeout: 15_000 });
    await expect(page.getByTestId("upsell-accept")).toContainText("SIM, QUERO O ESSENCIAL");
    await page.getByTestId("upsell-accept").click();
    await expect(page).toHaveURL(/\/obrigado\//, { timeout: 45_000 });
    const summary = page.getByTestId("thank-you-summary");
    await expect(summary).toContainText("Ebook Moçambique");
    await expect(summary).toContainText("Guia Digital Renomeado");
  });
});
