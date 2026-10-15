import { expect, test } from "@playwright/test";
import { completeAndPublish, errorToast, login, mzn, toast } from "./helpers";

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
    await page.getByLabel("Moeda").selectOption("MZN");
    await expect(page.getByTestId("new-product-draft-note")).toBeVisible(); // um produto novo é sempre rascunho
    await page.getByRole("button", { name: "Criar produto" }).click();
    await toast(page, "Produto criado");
    await expect(page).toHaveURL(/\/produtos\/[a-z0-9]+\?criado=1$/);
    // link de checkout gerado automaticamente, com confirmação
    await expect(page.getByText("Produto criado com sucesso! O link do checkout já está pronto a partilhar.")).toBeVisible();
    await expect(page.getByTestId("product-checkout-url")).toHaveText("http://localhost:3100/checkout/guia-digital-de-exemplo");
    await expect(page.getByTestId("checkout-link-card").getByText("Indisponível")).toBeVisible(); // rascunho

    await page.getByLabel("Nome").fill("Guia Digital Editado");
    await page.getByLabel("Preço", { exact: true }).fill("247,90");
    await page.getByRole("button", { name: "Guardar alterações" }).click();
    await toast(page, "Produto atualizado");
    await page.reload();
    await expect(page.getByLabel("Nome")).toHaveValue("Guia Digital Editado");
    await expect(page.getByLabel("Preço", { exact: true })).toHaveValue("247,90");

    // incompleto: a publicação é recusada (servidor) e é mostrado o que falta
    await expect(page.getByTestId("product-requirements")).toContainText("Produto incompleto");
    await expect(page.getByTestId("req-funnel")).toHaveAttribute("data-ok", "false");
    await page.getByTestId("publish-product").click();
    await errorToast(page, /Produto incompleto — não pode ser publicado/);
    await page.goto("/produtos");
    await expect(page.getByTestId("product-stage").first()).toHaveAttribute("data-stage", "draft"); // configuração ainda não iniciada
    // computador: estado + o que falta, de forma compacta (o aviso completo está no produto e no cartão do telemóvel)
    await expect(page.getByTestId("product-incomplete").first()).toContainText("Falta:");
    // "Completar configuração" → aba Funis com o produto já escolhido
    await page.getByTestId("complete-setup").first().click();
    await expect(page).toHaveURL(/\/funis\?criar=/);
    await expect(page.getByRole("dialog").getByRole("combobox")).toHaveValue(/[a-z0-9]+/);
    await page.getByTestId("create-wizard-funnel").click();
    await completeAndPublish(page, "Guia Digital Editado", { fromWizard: true, deliveryUrl: "https://conteudo.exemplo.co.mz/guia" });
    await page.goto("/produtos");
    await expect(page.getByTestId("product-stage").first()).toHaveAttribute("data-stage", "published");
    await expect(page.getByRole("link", { name: /Guia Digital Editado/ }).first()).toBeVisible();
    await expect(page.getByText(mzn("247,90")).first()).toBeVisible();
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

  test("o link do checkout é automático, único e não muda com a edição do nome", async ({ page, context }) => {
    await login(page);
    await page.goto("/produtos");
    await page.getByRole("link", { name: /Guia Digital Editado/ }).first().click();
    const card = page.getByTestId("checkout-link-card");
    await expect(card.getByText("Pronto a vender")).toBeVisible();
    const url = (await page.getByTestId("product-checkout-url").textContent())!.trim();
    expect(url).toBe("http://localhost:3100/checkout/guia-digital-de-exemplo");
    checkoutPath = new URL(url).pathname;
    // atualizar a página não gera outro link nem duplica o checkout
    await page.reload();
    await expect(page.getByTestId("product-checkout-url")).toHaveText(url);

    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await card.getByRole("button", { name: "Copiar link" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    const [popup] = await Promise.all([page.waitForEvent("popup"), card.getByRole("link", { name: "Abrir checkout" }).click()]);
    await expect(popup.getByRole("heading", { name: "Guia Digital Editado" })).toBeVisible();
    await popup.close();

    // o link também está na lista de produtos, com opção de copiar
    await page.goto("/produtos");
    const row = page.getByTestId("product-row-link").first();
    await expect(row).toContainText("/checkout/guia-digital-de-exemplo");
    await row.getByRole("button", { name: "Copiar link" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);

    // a aba Personalizar Checkout só serve para escolher o produto e personalizar (sem links)
    await page.getByRole("link", { name: "Personalizar Checkout", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Personalizar Checkout" })).toBeVisible();
    await expect(page.getByTestId("personalization-card")).toHaveCount(1);
    await expect(page.locator("main a[href^='/checkout/']")).toHaveCount(0);
    await expect(page.getByText("/checkout/guia-digital-de-exemplo")).toHaveCount(0);
  });

  test("checkout público: dados corretos em MZN, validação, métodos de pagamento, sem campos de cartão", async ({ page }) => {
    await page.goto(checkoutPath);
    await expect(page.getByRole("heading", { name: "Guia Digital Editado" })).toBeVisible();
    await expect(page.getByText(mzn("247,90")).first()).toBeVisible();
    await expect(page.locator("input[name*=card], input[autocomplete^=cc-], input[name=cvv]")).toHaveCount(0);

    await page.getByRole("button", { name: "Finalizar compra" }).click();
    await expect(page.getByText("Introduza o seu nome completo")).toBeVisible();
    await expect(page.getByText("Introduza um email válido")).toBeVisible();

    await page.getByLabel("Nome completo").fill("Ana Compradora");
    await page.getByLabel("Email").fill("ana@exemplo.pt");
    await expect(page.getByRole("radio", { name: /M-Pesa/ })).toBeChecked();
    await page.getByRole("button", { name: "Finalizar compra" }).click();
    await expect(page.getByText("Introduza um número móvel moçambicano válido").first()).toBeVisible();
    // os dados do formulário mantêm-se
    await expect(page.getByLabel("Nome completo")).toHaveValue("Ana Compradora");
  });

  test("nenhum pedido foi criado e a sessão de checkout foi registada", async ({ page }) => {
    await login(page);
    await page.goto("/pedidos");
    await expect(page.getByText("Ainda não existem pedidos")).toBeVisible();
    await page.goto("/checkouts/avancado");
    await expect(page.getByText(/\d+ \/ 0/).first()).toBeVisible();
  });

  test("checkout desativado mostra indisponibilidade sem detalhes internos", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts/avancado");
    await page.getByRole("link", { name: /Checkout — Guia Digital/ }).first().click();
    await page.getByRole("button", { name: "Desativar" }).click();
    await toast(page, "Checkout desativado");
    await page.goto(checkoutPath);
    await expect(page.getByRole("heading", { name: "Link indisponível" })).toBeVisible();
    await page.goto("/checkout/naoexiste1234567");
    await expect(page.getByRole("heading", { name: "Link indisponível" })).toBeVisible();
    // reativar: o mesmo link volta a funcionar
    await page.goto("/checkouts/avancado");
    await page.getByRole("link", { name: /Checkout — Guia Digital/ }).first().click();
    await page.getByRole("button", { name: "Ativar" }).click();
    await toast(page, "Checkout ativado");
    await page.goto(checkoutPath);
    await expect(page.getByRole("heading", { name: "Guia Digital Editado" })).toBeVisible();
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
    await expect(page.getByText(/Válido: 247,90\sMZN − 24,79\sMZN = 223,11\sMZN/).first()).toBeVisible();
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
    await expect(page.getByText(mzn("0,00")).first()).toBeVisible();
    await expect(page.getByText("Pedidos pendentes")).toBeVisible();
  });
});
