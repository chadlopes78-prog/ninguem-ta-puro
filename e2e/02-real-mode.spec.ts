import { expect, test } from "@playwright/test";
import { login, toast } from "./helpers";

test.describe.serial("modo real: produto → checkout → link público (sem pagamentos)", () => {
  let checkoutPath = "";

  test("dashboard vazio mostra estado útil", async ({ page }) => {
    await login(page);
    await expect(page.getByText("Ainda não existem vendas")).toBeVisible();
    await expect(page.getByRole("link", { name: "Criar produto" })).toBeVisible();
  });

  test("criar produto com validação e editar com persistência", async ({ page }) => {
    await login(page);
    await page.goto("/produtos");
    await expect(page.getByText("Ainda não tem produtos")).toBeVisible();
    await page.getByRole("link", { name: "Criar primeiro produto" }).click();
    await page.getByRole("button", { name: "Criar produto" }).click();
    await expect(page.getByText("O nome deve ter pelo menos 2 caracteres")).toBeVisible();
    await expect(page.getByText("Selecione um tipo")).toBeVisible();

    await page.getByLabel("Nome").fill("Guia Digital de Exemplo");
    await page.getByLabel("Descrição").fill("Produto fictício utilizado para validar a interface.");
    await page.getByLabel("Tipo").selectOption("EBOOK");
    await page.getByLabel("Preço", { exact: true }).fill("197,00");
    await page.getByLabel("Moeda").selectOption("BRL");
    await page.getByRole("button", { name: "Criar produto" }).click();
    await toast(page, "Produto criado");
    await expect(page).toHaveURL(/\/produtos\/[a-z0-9]+$/);

    await page.getByLabel("Nome").fill("Guia Digital Editado");
    await page.getByLabel("Preço", { exact: true }).fill("247,90");
    await page.getByRole("button", { name: "Guardar alterações" }).click();
    await toast(page, "Produto atualizado");
    await page.reload();
    await expect(page.getByLabel("Nome")).toHaveValue("Guia Digital Editado");
    await expect(page.getByLabel("Preço", { exact: true })).toHaveValue("247,90");

    await page.getByRole("button", { name: "Publicar" }).click();
    await toast(page, "Produto publicado");
    await page.goto("/produtos");
    await expect(page.getByRole("link", { name: /Guia Digital Editado/ }).first()).toBeVisible();
    await expect(page.getByText("R$ 247,90").first()).toBeVisible();
  });

  test("pesquisa e filtros de produtos", async ({ page }) => {
    await login(page);
    await page.goto("/produtos");
    await page.getByRole("searchbox", { name: "Pesquisar" }).fill("inexistente-xyz");
    await expect(page.getByText("Nenhum produto encontrado")).toBeVisible();
    await page.getByRole("searchbox", { name: "Pesquisar" }).fill("guia");
    await expect(page.getByRole("link", { name: /Guia Digital Editado/ }).first()).toBeVisible();
    await page.getByLabel("Tipo").selectOption("COURSE");
    await expect(page.getByText("Nenhum produto encontrado")).toBeVisible();
  });

  test("criar checkout gera link que abre a página pública correta", async ({ page, context }) => {
    await login(page);
    await page.goto("/checkouts");
    await page.getByRole("link", { name: "Criar checkout" }).click();
    await page.getByRole("combobox", { name: "Produto", exact: true }).selectOption({ label: "Guia Digital Editado" });
    await page.getByLabel("Nome interno").fill("Checkout principal E2E");
    await page.getByRole("button", { name: "Criar checkout" }).click();
    await toast(page, "Checkout criado");
    await expect(page).toHaveURL(/\/checkouts\/[a-z0-9]+$/);
    checkoutPath = (await page.getByTestId("checkout-path").textContent())!.trim();
    expect(checkoutPath).toMatch(/^\/checkout\/[A-Za-z0-9]{14}$/);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copiar link" }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe(`http://localhost:3100${checkoutPath}`);
  });

  test("checkout público: dados corretos, validação, sem campos de cartão, pagamento indisponível", async ({ page }) => {
    await page.goto(checkoutPath);
    await expect(page.getByRole("heading", { name: "Guia Digital Editado" })).toBeVisible();
    await expect(page.getByText("R$ 247,90").first()).toBeVisible();
    await expect(page.locator("input[name*=card], input[autocomplete^=cc-], input[name=cvv]")).toHaveCount(0);

    await page.getByRole("button", { name: "Finalizar compra" }).click();
    await expect(page.getByText("Introduza o seu nome completo")).toBeVisible();
    await expect(page.getByText("Introduza um email válido")).toBeVisible();

    await page.getByLabel("Nome completo").fill("Ana Compradora");
    await page.getByLabel("Email").fill("ana@exemplo.pt");
    await page.getByRole("button", { name: "Finalizar compra" }).click();
    await expect(page.getByText("O processamento de pagamentos ainda não está configurado")).toBeVisible();
    // os dados do formulário mantêm-se
    await expect(page.getByLabel("Nome completo")).toHaveValue("Ana Compradora");
  });

  test("nenhum pedido foi criado e a sessão de checkout foi registada", async ({ page }) => {
    await login(page);
    await page.goto("/pedidos");
    await expect(page.getByText("Ainda não existem pedidos")).toBeVisible();
    await page.goto("/checkouts");
    await expect(page.getByText("1 / 0").first()).toBeVisible();
  });

  test("checkout desativado mostra indisponibilidade sem detalhes internos", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts");
    await page.getByRole("link", { name: /Checkout principal E2E/ }).first().click();
    await page.getByRole("button", { name: "Desativar" }).click();
    await toast(page, "Checkout desativado");
    await page.goto(checkoutPath);
    await expect(page.getByRole("heading", { name: "Link indisponível" })).toBeVisible();
    await page.goto("/checkout/naoexiste1234567");
    await expect(page.getByRole("heading", { name: "Link indisponível" })).toBeVisible();
  });

  test("cupões: criação, código duplicado e teste", async ({ page }) => {
    await login(page);
    await page.goto("/cupons/novo");
    await page.getByLabel("Código").fill("TESTE10");
    await page.getByLabel("Percentagem (%)").fill("10");
    await page.getByRole("button", { name: "Criar cupão" }).click();
    await toast(page, "Cupão criado");
    await expect(page.getByRole("link", { name: "TESTE10" })).toBeVisible();
    await page.goto("/cupons/novo");
    await page.getByLabel("Código").fill("teste10");
    await page.getByRole("button", { name: "Criar cupão" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Já existe um cupão com este código" }).first()).toBeVisible();

    await page.goto("/cupons");
    await page.getByLabel("Oferta").selectOption({ index: 1 });
    await page.getByLabel("Código", { exact: true }).fill("TESTE10");
    await page.getByRole("button", { name: "Testar" }).click();
    await expect(page.getByText("Válido: R$ 247,90 − R$ 24,79 = R$ 223,11").first()).toBeVisible();
    await page.getByLabel("Código", { exact: true }).fill("NAOEXISTE");
    await page.getByRole("button", { name: "Testar" }).click();
    await expect(page.getByText("Cupão não encontrado").first()).toBeVisible();
  });

  test("pedido manual de teste nunca é aprovado e não conta como faturação", async ({ page }) => {
    await login(page);
    await page.goto("/pedidos");
    await page.getByRole("button", { name: "Pedido manual de teste" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("option[value=APPROVED]")).toHaveCount(0);
    await dialog.getByLabel("Produto").selectOption({ label: "Guia Digital Editado" });
    await dialog.getByLabel("Nome do cliente").fill("Cliente Teste");
    await dialog.getByLabel("Email do cliente").fill("teste@exemplo.pt");
    await dialog.getByRole("button", { name: "Criar pedido" }).click();
    await toast(page, "Pedido manual de teste criado");
    await expect(page.getByText("Teste manual").first()).toBeVisible();
    await page.goto("/dashboard");
    await expect(page.getByText("R$ 0,00").first()).toBeVisible();
    await expect(page.getByText("Pedidos pendentes")).toBeVisible();
  });
});
