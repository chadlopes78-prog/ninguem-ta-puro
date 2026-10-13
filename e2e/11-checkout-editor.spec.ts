// Editor visual do checkout (tipo Elementor): checkout padrão, remoções pedidas, arrastar e soltar,
// imagens, estilos, rascunho/publicação, telemóvel, compra de teste e isolamento.
// Compras só com o fornecedor de TESTE local (nenhum pagamento real).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { login, mzn, noHorizontalScroll, toast } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let publicPath = "";
let editorUrl = "";

/** Erros na consola/página durante cada teste (ponto 18). */
const problems: string[] = [];
test.beforeEach(({ page }) => {
  problems.length = 0;
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
});
test.afterEach(() => expect(problems, problems.join("\n")).toEqual([]));

/** Arrastar com o rato (como uma pessoa): "top"/"bottom" = metade do alvo onde se larga. */
async function drag(page: Page, from: Locator, to: Locator, where: "top" | "bottom") {
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + Math.min(a.height / 2, 20));
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + Math.min(a.height / 2, 20) + 12, { steps: 4 });
  const t = (await to.boundingBox())!;
  const y = where === "top" ? t.y + Math.min(8, t.height / 4) : t.y + t.height - Math.min(8, t.height / 4);
  await page.mouse.move(t.x + t.width / 2, y, { steps: 14 });
  // linha que mostra onde o elemento vai ficar, antes de largar
  await expect(page.getByTestId("drop-indicator").first()).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId("drop-indicator")).toHaveCount(0);
}

const canvas = (page: Page) => page.getByTestId("editor-canvas");
const elementTypes = (page: Page, sectionId: string) => canvas(page).locator(`[data-editor-section="${sectionId}"] [data-testid=canvas-element]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-type")));
const el = (page: Page, id: string) => canvas(page).locator(`[data-editor-element="${id}"]`);

test.describe.serial("editor visual do checkout", () => {
  test("1–2. checkout padrão profissional com dados reais, sem 'Compra segura', cabeçalho cifrado nem rodapé", async ({ page }) => {
    await login(page);
    await page.goto("/produtos/novo");
    await page.getByLabel("Nome").fill("Curso Editor Visual");
    await page.getByLabel("Descrição").fill("Aprenda a montar páginas de venda que convertem, passo a passo.");
    await page.getByLabel("Tipo").selectOption("COURSE");
    await page.getByLabel("Preço", { exact: true }).fill("500,00");
    await page.getByLabel("Estado").selectOption("PUBLISHED");
    await page.getByLabel("URL de entrega/acesso").fill("https://conteudo.exemplo.co.mz/curso");
    await page.getByRole("button", { name: "Criar produto" }).click();
    await toast(page, "Produto criado");
    publicPath = new URL((await page.getByTestId("product-checkout-url").textContent())!.trim()).pathname;
    await page.getByTestId("checkout-link-card").getByRole("link", { name: "Personalizar checkout" }).click();
    await expect(page.getByTestId("checkout-editor")).toBeVisible();
    editorUrl = new URL(page.url()).pathname;

    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await page.goto(publicPath);
      await expect(page.getByRole("heading", { level: 1, name: "Curso Editor Visual" })).toBeVisible();
      await expect(page.getByText("Aprenda a montar páginas de venda")).toBeVisible();
      await expect(page.getByTestId("price")).toContainText(mzn("500,00"));
      await expect(page.getByTestId("purchase-form")).toBeVisible();
      await expect(page.getByTestId("order-summary")).toContainText("Total");
      await expect(page.getByRole("button", { name: "Finalizar compra" })).toBeVisible();
      const body = await page.locator("body").innerText();
      expect(body).not.toContain("Compra segura");
      expect(body).not.toContain("Ligação cifrada");
      expect(body).not.toMatch(/©/);
      expect(body).not.toContain("Suporte:");
      await expect(page.locator("header")).toHaveCount(0);
      await expect(page.locator("footer")).toHaveCount(0);
      await noHorizontalScroll(page);
    }
  });

  test("3–7. arrastar imagem para cima do título, carregar ficheiro, mover para baixo, reorganizar secções e estilos", async ({ page }) => {
    await login(page);
    await page.goto(editorUrl);
    await expect(canvas(page)).toHaveAttribute("data-device", "desktop");
    expect(await elementTypes(page, "hero")).toEqual(["image", "heading", "text", "price", "checkout"]);

    // 3–4. arrastar "Imagem" da biblioteca para cima do título
    await drag(page, page.getByTestId("lib-image"), el(page, "product-name"), "top");
    expect(await elementTypes(page, "hero")).toEqual(["image", "image", "heading", "text", "price", "checkout"]);
    const newImage = canvas(page).locator("[data-testid=canvas-element][data-type=image]").nth(1);
    const imageId = (await newImage.getAttribute("data-editor-element"))!;
    // carregar uma imagem (validada no servidor) e texto alternativo
    await page.getByTestId("choose-image").click();
    await page.getByTestId("media-file").setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: PNG });
    await toast(page, "Imagem carregada");
    await expect(el(page, imageId).locator("img")).toHaveAttribute("src", /^\/api\/public\/media\/[a-z0-9]+$/);
    await page.getByLabel("Texto alternativo (acessibilidade)").fill("Capa do curso");
    // proporção e enquadramento da imagem
    await page.getByLabel("Proporção").selectOption("3/1");
    await expect(el(page, imageId).locator("img")).toHaveCSS("aspect-ratio", "3 / 1");

    // 5. mover a imagem para baixo do título
    await drag(page, el(page, imageId), el(page, "product-name"), "bottom");
    expect(await elementTypes(page, "hero")).toEqual(["image", "heading", "image", "text", "price", "checkout"]);
    await expect(canvas(page).locator("[data-testid=canvas-element]").nth(2)).toHaveAttribute("data-editor-element", imageId);

    // 6. nova secção (arrastada da biblioteca) por baixo; mover a descrição para lá; secção para o topo
    await drag(page, page.getByTestId("lib-section-1"), canvas(page).locator('[data-editor-section="hero"]'), "bottom");
    const sections = canvas(page).getByTestId("canvas-section");
    await expect(sections).toHaveCount(2);
    const newSection = (await sections.nth(1).getAttribute("data-editor-section"))!;
    await drag(page, el(page, "product-description"), canvas(page).locator(`[data-editor-section="${newSection}"] [data-testid=canvas-column]`), "top");
    expect(await elementTypes(page, newSection)).toEqual(["text"]);
    expect(await elementTypes(page, "hero")).toEqual(["image", "heading", "image", "price", "checkout"]);
    await canvas(page).locator(`[data-editor-section="${newSection}"]`).hover();
    await drag(page, canvas(page).locator(`[data-editor-section="${newSection}"]`).getByTestId("section-handle"), canvas(page).locator('[data-editor-section="hero"]'), "top");
    await expect(sections.first()).toHaveAttribute("data-editor-section", newSection);

    // 7. cores e tamanhos de letra do título (com desfazer/refazer)
    await el(page, "product-name").click();
    await page.getByRole("tab", { name: "Estilo" }).click();
    await page.getByLabel("Tamanho (computador)", { exact: true }).fill("44");
    await page.getByLabel("Cor do texto", { exact: true }).fill("#FF5500");
    const h1 = el(page, "product-name").locator("h1");
    await expect(h1).toHaveCSS("font-size", "44px");
    await expect(h1).toHaveCSS("color", "rgb(255, 85, 0)");
    await page.getByTestId("undo").click();
    await expect(h1).not.toHaveCSS("color", "rgb(255, 85, 0)");
    await page.getByTestId("redo").click();
    await expect(h1).toHaveCSS("color", "rgb(255, 85, 0)");
    await expect(page.getByTestId("save-status")).toHaveText("Alterações por guardar");

    // 8. guardar o rascunho
    await page.getByTestId("save-draft").click();
    await toast(page, "Rascunho guardado");
    await expect(page.getByTestId("save-status")).toContainText("Guardado às");

    // 9. reabrir: tudo persiste (vem da base de dados)
    await page.reload();
    await expect(canvas(page).getByTestId("canvas-section").first()).toHaveAttribute("data-editor-section", newSection);
    expect(await elementTypes(page, "hero")).toEqual(["image", "heading", "image", "price", "checkout"]);
    await expect(el(page, imageId).locator("img")).toHaveAttribute("alt", "Capa do curso");
    await expect(el(page, "product-name").locator("h1")).toHaveCSS("font-size", "44px");

    // o rascunho não altera o checkout público
    await page.goto(publicPath);
    await expect(page.getByRole("img", { name: "Capa do curso" })).toHaveCount(0);
  });

  test("10–12. publicar: o checkout público mostra a versão publicada, em computador e telemóvel", async ({ page }) => {
    await login(page);
    await page.goto(editorUrl);
    await page.getByTestId("publish").click();
    await toast(page, "Personalização publicada");

    await page.goto(publicPath);
    const img = page.getByRole("img", { name: "Capa do curso" });
    await expect(img).toBeVisible();
    expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    const h1 = page.getByRole("heading", { level: 1, name: "Curso Editor Visual" });
    await expect(h1).toHaveCSS("font-size", "44px");
    await expect(h1).toHaveCSS("color", "rgb(255, 85, 0)");
    // ordem publicada: descrição (secção de cima) → título → imagem → preço → formulário
    const y = async (l: Locator) => (await l.boundingBox())!.y;
    expect(await y(page.getByText("Aprenda a montar páginas de venda"))).toBeLessThan(await y(h1));
    expect(await y(h1)).toBeLessThan(await y(img));
    expect(await y(img)).toBeLessThan(await y(page.getByTestId("price")));
    await expect(page.getByText(mzn("500,00")).first()).toBeVisible(); // preço da BD, inalterado
    await noHorizontalScroll(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(h1).toHaveCSS("font-size", "35px"); // tamanho reduzido automaticamente no telemóvel
    await expect(page.getByLabel("Nome completo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar compra" })).toBeVisible();
    await noHorizontalScroll(page);

    // editor também utilizável no telemóvel (sessão já iniciada)
    await page.goto(editorUrl);
    await expect(canvas(page)).toHaveAttribute("data-device", "mobile");
    await noHorizontalScroll(page);
    await el(page, "product-name").click();
    await page.getByRole("button", { name: "Editar propriedades" }).click();
    await expect(page.getByTestId("element-properties")).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("13–16. compra de teste no checkout personalizado; confirmação oficial; redirecionamento para o acesso", async ({ page }) => {
    await page.goto(publicPath);
    await page.getByLabel("Nome completo").fill("Comprador Editor");
    await page.getByLabel("Email").fill("comprador.editor@exemplo.co.mz");
    await page.getByRole("radio", { name: "M-Pesa (teste)" }).check();
    await page.getByLabel(/Número M-Pesa/).fill("84 111 2221"); // termina em 1 → a consulta oficial confirma
    await page.getByRole("button", { name: "Finalizar compra" }).click();
    await expect(page).toHaveURL(/\/pagamento\/[A-Za-z0-9_-]+$/);
    await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "paid", { timeout: 30_000 });
    await page.getByTestId("access-link").click();
    await expect(page.getByRole("heading", { name: "Os seus produtos" })).toBeVisible();
    await expect(page.getByTestId("delivery-link")).toHaveAttribute("href", "https://conteudo.exemplo.co.mz/curso");
  });

  test("17. o editor e a biblioteca não dão acesso a checkouts ou imagens de outras contas", async ({ page, browser }) => {
    await login(page);
    expect((await page.goto("/checkouts/personalizar/cl0000000000000000000000x"))?.status()).toBe(404);
    expect((await page.request.delete("/api/media/cl0000000000000000000000x")).status()).toBe(404);
    expect((await page.request.post("/api/media", { headers: { origin: "https://site-malicioso.exemplo" }, multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } } })).status()).toBe(403);
    expect((await page.request.post("/api/media", { multipart: { file: { name: "a.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg><script>alert(1)</script></svg>") } } })).status()).toBe(400);
    const anon = await browser.newContext();
    expect((await anon.request.get("/api/media")).status()).toBe(401);
    await anon.close();
  });

  test("sair com alterações por guardar pede confirmação; cancelar repõe a última versão guardada", async ({ page }) => {
    await login(page);
    await page.goto(editorUrl);
    await page.getByTestId("lib-divider").click();
    await expect(page.getByTestId("save-status")).toHaveText("Alterações por guardar");
    await page.getByRole("link", { name: "Voltar a Personalizar Checkout" }).click();
    await expect(page.getByRole("dialog")).toContainText("Sair sem guardar?");
    await page.getByRole("dialog").getByRole("button", { name: "Voltar" }).click();
    await expect(page).toHaveURL(new RegExp(editorUrl));
    await page.getByTestId("cancel-changes").click();
    await page.getByTestId("confirm-action").click();
    await expect(canvas(page).locator("[data-type=divider]")).toHaveCount(0);
    await expect(page.getByTestId("save-status")).not.toHaveText("Alterações por guardar");
  });
});
