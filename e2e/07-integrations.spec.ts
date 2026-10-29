// Aba Integrações: gateways EPay e E2Payments independentes. Sem acesso às APIs reais neste ambiente,
// o teste de ligação da E2Payments falha de forma controlada (erro de configuração, nada fica ativo).
import { expect, test } from "@playwright/test";
import { login, noHorizontalScroll, toast } from "./helpers";

const SECRET = "segredo-e2e-NUNCA-MOSTRAR-123456";

test.describe.serial("gateways de pagamento", () => {
  test("visão geral em cartões; cada gateway tem a sua página de configuração com o estado real", async ({ page }) => {
    await login(page);
    await page.goto("/integracoes");
    await expect(page.getByRole("heading", { name: "Pagamentos" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Rastreamento de anúncios" })).toBeVisible();
    const cardE2 = page.getByTestId("integration-e2payments");
    await expect(page.getByTestId("integration-epay").getByText("Processamento de pagamentos através da EPay.")).toBeVisible();
    await expect(cardE2.getByText("Processamento de pagamentos através da E2Payments.")).toBeVisible();
    // sem EPAY_SECRET_KEY nem credenciais E2Payments neste ambiente
    await expect(page.getByTestId("integration-epay").getByTestId("integration-status")).toHaveText("Credenciais por configurar");
    await expect(cardE2.getByTestId("integration-status")).toHaveText("Credenciais por configurar");
    await expect(cardE2.getByRole("button", { name: "Ativar" })).toBeDisabled();
    // logótipos oficiais carregados (fundo transparente)
    for (const id of ["epay", "e2payments", "meta"]) {
      const img = page.getByTestId(`logo-${id}`).locator("img");
      await expect(img).toBeVisible();
      expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    // a página principal não mostra formulários nem credenciais
    await expect(page.getByLabel("Client Secret")).toHaveCount(0);
    await cardE2.getByTestId("configure-e2payments").click();
    await expect(page).toHaveURL(/\/integracoes\/e2payments$/);
    const e2 = page.getByTestId("gateway-e2payments");
    await expect(e2.getByTestId("gateway-status")).toHaveText("Credenciais por configurar");
    await expect(e2.getByRole("button", { name: "Ativar" })).toBeDisabled();
    await expect(e2.getByLabel("Client ID")).toBeVisible();
    await expect(e2.getByLabel("Client Secret")).toHaveAttribute("type", "password");
    // detalhes técnicos recolhidos
    await expect(page.getByTestId("checks-e2payments")).toBeHidden();
    await page.getByTestId("gateway-technical").locator("summary").click();
    await expect(page.getByTestId("checks-e2payments")).toBeVisible();
  });

  test("guardar credenciais: segredo nunca é devolvido e o gateway não fica ativo sem ligação verificada", async ({ page }) => {
    await login(page);
    await page.goto("/integracoes/e2payments");
    const e2 = page.getByTestId("gateway-e2payments");
    await e2.getByRole("button", { name: "Guardar e testar ligação" }).click();
    await expect(e2.getByText("Introduza o Client ID")).toBeVisible();

    await e2.getByLabel("Client ID").fill("cliente-e2e-0001");
    await e2.getByLabel("Client Secret").fill(SECRET);
    await e2.getByLabel("ID da carteira M-Pesa").fill("#123456");
    await e2.getByRole("button", { name: "Guardar e testar ligação" }).click();
    await toast(page, "Credenciais guardadas");
    await expect(e2.getByLabel("Client Secret")).toHaveValue("");
    await page.reload();
    const html = await page.content();
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain("cliente-e2e-0001");
    await expect(e2.getByText("Guardado: ••••0001. Deixe vazio para manter.")).toBeVisible();
    await expect(e2.getByLabel("ID da carteira M-Pesa")).toHaveValue("123456");
    // a E2Payments real não é acessível daqui: a ligação falha e o gateway não aparece como funcional
    await expect(e2.getByTestId("gateway-status")).toHaveText("Erro de configuração");
    await e2.getByRole("button", { name: "Ativar" }).click();
    await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: "Não foi ativado" }).first()).toBeVisible();
    await expect(e2.getByRole("button", { name: "Ativar" })).toBeVisible();
  });

  test("telemóvel: sem deslocamento horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    await page.goto("/integracoes");
    await expect(page.getByTestId("integration-e2payments")).toBeVisible();
    await noHorizontalScroll(page);
    await page.goto("/integracoes/e2payments");
    await expect(page.getByTestId("gateway-e2payments")).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("Pagar: cartão próprio, credenciais só em campos protegidos e endereço do webhook para a app da Pagar", async ({ page }) => {
    await login(page);
    await page.goto("/integracoes");
    const card = page.getByTestId("integration-pagar");
    await expect(card).toContainText("Pagar API");
    await card.getByTestId("configure-pagar").click();
    await expect(page).toHaveURL(/\/integracoes\/pagar$/);
    const form = page.getByTestId("pagar-form");
    await expect(form.locator("input:not([type=hidden])")).toHaveCount(3);
    // modo de teste por omissão; o modo real só fica disponível com credenciais de produção guardadas
    await expect(page.getByTestId("pagar-mode")).toHaveAttribute("data-mode", "test");
    await expect(page.getByTestId("pagar-mode-live")).toBeDisabled();
    await expect(page.getByTestId("pagar-creds-live")).toBeVisible();
    for (const name of ["apiKey", "signingSecret", "webhookSecret"]) await expect(form.locator(`input[name=${name}]`)).toHaveAttribute("type", "password");
    await expect(page.getByTestId("pagar-webhook-url")).toContainText("/api/webhooks/pagar");
    // formato inválido: recusado no servidor, nada é guardado nem mostrado
    await form.locator("input[name=apiKey]").fill("chave-sem-prefixo-123");
    await form.locator("input[name=signingSecret]").fill("sig_test_e2e_apenas_teste_000");
    await form.locator("input[name=webhookSecret]").fill("whsec_test_e2e_apenas_teste_000");
    await page.getByTestId("pagar-save").click();
    await expect(page.getByText("A API key da Pagar começa por sk_test_ ou sk_live_")).toBeVisible();
    expect(await page.content()).not.toContain("sig_test_e2e_apenas_teste_000");
    await noHorizontalScroll(page);
  });
});
