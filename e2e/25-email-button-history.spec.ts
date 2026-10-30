// Pedir email por produto, nome/cor do botão de pagamento no formulário do editor e limpar o histórico de vendas.
// Corre no fim (usa o "Ebook Moçambique" e as vendas criadas pelos testes anteriores).
import { expect, test } from "@playwright/test";
import { login, toast } from "./helpers";

test.describe.serial("email opcional, botão de pagamento e histórico", () => {
  test("desativar e voltar a ativar o email no produto; o checkout acompanha", async ({ page }) => {
    await login(page);
    await page.goto("/produtos");
    await page.locator("table").getByRole("link", { name: /Ebook Moçambique/ }).click();
    const toggle = page.getByTestId("collect-email-toggle");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await page.getByRole("button", { name: "Actualizar produto" }).click();
    await toast(page, "Produto atualizado");
    const productUrl = page.url();

    await page.goto("/checkout/ebook-mocambique");
    await expect(page.getByLabel("Nome completo")).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);

    await page.goto(productUrl);
    await expect(page.getByTestId("collect-email-toggle")).toHaveAttribute("aria-checked", "false");
    await page.getByTestId("collect-email-toggle").click();
    await page.getByRole("button", { name: "Actualizar produto" }).click();
    await toast(page, "Produto atualizado");
    await page.goto("/checkout/ebook-mocambique");
    await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  });

  test("editor: nome e cor do botão de pagamento no próprio formulário de compra", async ({ page }) => {
    await login(page);
    await page.goto("/produtos");
    await page.locator("table").getByRole("link", { name: /Ebook Moçambique/ }).click();
    await page.getByTestId("checkout-link-card").getByRole("link", { name: "Personalizar checkout" }).click();
    await expect(page.getByTestId("checkout-editor")).toBeVisible();
    await page.getByTestId("editor-canvas").locator(`[data-editor-element="checkout"]`).click({ position: { x: 12, y: 12 } });
    const settings = page.getByTestId("pay-button-settings");
    await expect(settings).toBeVisible();
    await settings.getByLabel("Nome do botão").fill("COMPRAR AGORA");
    await expect(page.getByTestId("editor-canvas").getByTestId("pay-button")).toContainText("COMPRAR AGORA");
  });

  test("Configurações: limpar todo o histórico deixa o Dashboard sem vendas; produtos e checkouts ficam", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes#historico");
    const card = page.getByTestId("sales-history-card");
    await expect(card.getByTestId("sales-history-counts")).not.toContainText("Histórico atual: 0 pedido");
    await card.getByTestId("clear-all-sales").click();
    await page.getByRole("button", { name: "Limpar tudo" }).click();
    await toast(page, /Histórico limpo/);
    await expect(card.getByTestId("sales-history-counts")).toContainText("Histórico atual: 0 pedido(s), dos quais 0");
    await page.goto("/pedidos");
    await expect(page.locator("table tbody tr")).toHaveCount(0);
    await page.goto("/checkout/ebook-mocambique");
    await expect(page.getByLabel("Nome completo")).toBeVisible();
  });
});
