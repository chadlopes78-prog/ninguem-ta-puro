// Personalização do checkout por produto: editor visual, rascunho vs publicação, isolamento e telemóvel.
// Corre depois de 02 (Guia Digital Editado) e 05 (Ebook Moçambique), em modo real.
import { expect, test } from "@playwright/test";
import { login, mzn, noHorizontalScroll, toast } from "./helpers";

const GUIA = "/checkout/guia-digital-de-exemplo";
const EBOOK = "/checkout/ebook-mocambique";

test.describe.serial("personalização do checkout", () => {
  test("lista os produtos reais com link, estado e ações", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts");
    await expect(page.getByRole("heading", { name: "Personalização do Checkout" })).toBeVisible();
    const cards = page.getByTestId("personalization-card");
    await expect(cards).toHaveCount(2);
    const ebook = cards.filter({ hasText: "Ebook Moçambique" });
    await expect(ebook.getByTestId("card-checkout-url")).toHaveText(`http://localhost:3100${EBOOK}`);
    await expect(ebook.getByText(mzn("1 250,00"))).toBeVisible();
    await expect(ebook.getByText("Publicado").first()).toBeVisible();
    await expect(ebook.getByRole("button", { name: "Copiar link de Ebook Moçambique" })).toBeVisible();
    await expect(ebook.getByRole("link", { name: "Abrir checkout de Ebook Moçambique" })).toHaveAttribute("href", EBOOK);
  });

  test("rascunho não altera o checkout público; publicar aplica só ao produto certo", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts");
    await page.getByTestId("personalization-card").filter({ hasText: "Guia Digital Editado" }).getByTestId("personalize").click();
    await expect(page).toHaveURL(/\/checkouts\/personalizar\/[a-z0-9]+$/);

    await page.getByTestId("add-block").click();
    await page.getByTestId("add-testimonials").click();
    await page.getByRole("textbox", { name: "Nome", exact: true }).fill("Marta Sitoe");
    await page.getByRole("textbox", { name: "Depoimento" }).fill("Material excelente, recomendo a todos.");
    await page.getByTestId("add-block").click();
    await page.getByTestId("add-countdown").click();
    await expect(page.getByTestId("editor-preview").getByText("Material excelente, recomendo a todos.")).toBeVisible();
    await expect(page.getByTestId("editor-preview").locator("[data-block=countdown]")).toBeVisible();

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
    await expect(page.locator("[data-block=countdown]")).toBeVisible();
    // preço e moeda continuam a vir do produto
    await expect(page.getByText(mzn("247,90")).first()).toBeVisible();

    // o outro produto não é afetado
    await page.goto(EBOOK);
    await expect(page.getByRole("heading", { name: "Ebook Moçambique" })).toBeVisible();
    await expect(page.locator("[data-block=testimonials]")).toHaveCount(0);
    await expect(page.locator("[data-block=countdown]")).toHaveCount(0);

    await page.goto("/checkouts");
    const guia = page.getByTestId("personalization-card").filter({ hasText: "Guia Digital Editado" });
    await expect(guia.getByText("Personalização publicada")).toBeVisible();
    await expect(guia.getByTestId("card-checkout-url")).toHaveText(`http://localhost:3100${GUIA}`);
  });

  test("renomear o produto mantém o link publicado", async ({ page }) => {
    await login(page);
    await page.goto("/produtos");
    await page.getByRole("link", { name: /Guia Digital Editado/ }).first().click();
    await page.getByLabel("Nome").fill("Guia Digital Renomeado");
    await page.getByRole("button", { name: "Guardar alterações" }).click();
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
    await expect(page.getByTestId("blocks-list")).toBeVisible();
    await noHorizontalScroll(page);
    await page.getByRole("tab", { name: "Pré-visualizar" }).click();
    await expect(page.getByTestId("editor-preview")).toBeVisible();
    await expect(page.getByTestId("blocks-list")).toBeHidden();
    await noHorizontalScroll(page);

    await page.goto(GUIA);
    await expect(page.getByText("Material excelente, recomendo a todos.")).toBeVisible();
    await expect(page.getByLabel("Nome completo")).toBeVisible();
    await noHorizontalScroll(page);
  });
});
