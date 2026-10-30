// Personalização do checkout por produto: editor visual, rascunho vs publicação, isolamento e telemóvel.
// Corre depois de 02 (Guia Digital Editado) e 05 (Ebook Moçambique), em modo real.
import { expect, test } from "@playwright/test";
import { login, mzn, noHorizontalScroll, toast } from "./helpers";

const GUIA = "/checkout/guia-digital-de-exemplo";
const EBOOK = "/checkout/ebook-mocambique";

test.describe.serial("personalização do checkout", () => {
  test("lista os produtos reais com estado e ação de personalizar, sem links", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts");
    await expect(page.getByRole("heading", { name: "Personalizar Checkout" })).toBeVisible();
    const cards = page.getByTestId("personalization-card");
    await expect(cards).toHaveCount(2);
    const ebook = cards.filter({ hasText: "Ebook Moçambique" });
    await expect(ebook.getByText(mzn("1 250,00"))).toBeVisible();
    await expect(ebook.getByText("Publicado").first()).toBeVisible();
    await expect(ebook.getByRole("link", { name: "Personalizar Checkout de Ebook Moçambique" })).toBeVisible();
    await expect(page.locator("main a[href^='/checkout/']")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Copiar link/ })).toHaveCount(0);
  });

  test("rascunho não altera o checkout público; publicar aplica só ao produto certo", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts");
    await page.getByTestId("personalization-card").filter({ hasText: "Guia Digital Editado" }).getByTestId("personalize").click();
    await expect(page).toHaveURL(/\/checkouts\/personalizar\/[a-z0-9]+$/);

    // clicar num elemento da biblioteca adiciona-o à página (também pode ser arrastado — ver 11-checkout-editor)
    await page.getByTestId("lib-testimonials").click();
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Marta Sitoe");
    await page.getByRole("textbox", { name: "Testemunho", exact: true }).fill("Material excelente, recomendo a todos.");
    await page.getByTestId("lib-countdown").click();
    await expect(page.getByTestId("editor-preview").getByText("Material excelente, recomendo a todos.")).toBeVisible();
    // o modelo padrão já tem um cronómetro; o novo é o «Oferta termina em»
    await expect(page.getByTestId("editor-preview").locator("[data-block=countdown]").filter({ hasText: "Oferta termina em" })).toBeVisible();

    await page.getByTestId("save-draft").click();
    await toast(page, "Rascunho guardado");
    await expect(page.getByText("Alterações por publicar").first()).toBeVisible();

    // o público continua com a versão anterior (modelo padrão)
    await page.goto(GUIA);
    await expect(page.getByRole("heading", { name: "Guia Digital Editado" })).toBeVisible();
    await expect(page.locator("[data-block=testimonials]")).toHaveCount(0);

    await page.goBack();
    await page.getByTestId("publish").click();
    await toast(page, "Personalização publicada");

    await page.goto(GUIA);
    await expect(page.getByText("Material excelente, recomendo a todos.")).toBeVisible();
    await expect(page.locator("[data-block=countdown]").filter({ hasText: "Oferta termina em" })).toBeVisible();
    // preço e moeda continuam a vir do produto
    await expect(page.getByText(mzn("247,90")).first()).toBeVisible();

    // o outro produto não é afetado
    await page.goto(EBOOK);
    await expect(page.getByRole("heading", { name: "Ebook Moçambique" })).toBeVisible();
    // (o modelo padrão do outro produto já tem o seu próprio cronómetro «OFERTA EXPIRA EM»)
    await expect(page.getByText("Material excelente, recomendo a todos.")).toHaveCount(0);
    await expect(page.locator("[data-block=countdown]").filter({ hasText: "Oferta termina em" })).toHaveCount(0);

    await page.goto("/checkouts");
    const guia = page.getByTestId("personalization-card").filter({ hasText: "Guia Digital Editado" });
    await expect(guia.getByText("Personalização publicada")).toBeVisible();
    // o link (inalterado) continua na aba Produtos
    await page.goto("/produtos");
    await expect(page.getByTestId("product-row-link").filter({ hasText: GUIA, visible: true })).toHaveCount(1);
  });

  test("renomear o produto mantém o link publicado", async ({ page }) => {
    await login(page);
    await page.goto("/produtos");
    await page.getByRole("link", { name: /Guia Digital Editado/ }).first().click();
    await page.getByLabel("Nome do produto").fill("Guia Digital Renomeado");
    await page.getByRole("button", { name: "Actualizar produto" }).click();
    await toast(page, "Produto atualizado");
    await page.reload();
    await expect(page.getByTestId("product-checkout-url")).toHaveText(`http://localhost:3100${GUIA}`);
    await page.goto(GUIA);
    await expect(page.getByRole("heading", { name: "Guia Digital Renomeado" })).toBeVisible();
    await expect(page.getByText("Material excelente, recomendo a todos.")).toBeVisible();
  });

  test("telemóvel: lista, editor e checkout personalizados sem deslocamento horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.goto("/checkouts");
    await expect(page.getByTestId("personalization-card")).toHaveCount(2);
    await noHorizontalScroll(page);

    await page.getByTestId("personalization-card").first().getByTestId("personalize").click();
    // no telemóvel: separadores Elementos / Página / Propriedades, sem deslocamento horizontal
    await expect(page.getByTestId("editor-canvas")).toBeVisible();
    await expect(page.getByTestId("editor-canvas")).toHaveAttribute("data-device", "mobile");
    await noHorizontalScroll(page);
    await page.getByTestId("pane-library").click();
    await expect(page.getByTestId("element-library")).toBeVisible();
    await expect(page.getByTestId("editor-canvas")).toBeHidden();
    await noHorizontalScroll(page);
    await page.getByTestId("pane-canvas").click();
    await expect(page.getByTestId("editor-canvas")).toBeVisible();

    await page.goto(GUIA);
    await expect(page.getByText("Material excelente, recomendo a todos.")).toBeVisible();
    await expect(page.getByLabel("Nome completo")).toBeVisible();
    await noHorizontalScroll(page);
  });
});
