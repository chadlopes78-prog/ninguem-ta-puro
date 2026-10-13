// Aba Integrações: gateways EPay e E2Payments independentes. Sem acesso às APIs reais neste ambiente,
// o teste de ligação da E2Payments falha de forma controlada (erro de configuração, nada fica ativo).
import { expect, test } from "@playwright/test";
import { login, noHorizontalScroll, toast } from "./helpers";

const SECRET = "segredo-e2e-NUNCA-MOSTRAR-123456";

test.describe.serial("gateways de pagamento", () => {
  test("dois cartões independentes com estado real", async ({ page }) => {
    await login(page);
    await page.goto("/integracoes");
    await expect(page.getByRole("heading", { name: "Gateways de Pagamento" })).toBeVisible();
    const epay = page.getByTestId("gateway-epay");
    const e2 = page.getByTestId("gateway-e2payments");
    await expect(epay.getByText("Processamento de pagamentos através da EPay.")).toBeVisible();
    await expect(e2.getByText("Processamento de pagamentos através da E2Payments.")).toBeVisible();
    // sem EPAY_SECRET_KEY nem credenciais E2Payments neste ambiente
    await expect(epay.getByTestId("gateway-status")).toHaveText("Credenciais por configurar");
    await expect(e2.getByTestId("gateway-status")).toHaveText("Credenciais por configurar");
    await expect(e2.getByRole("button", { name: "Ativar" })).toBeDisabled();
    await expect(e2.getByLabel("Client ID")).toBeVisible();
    await expect(e2.getByLabel("Client Secret")).toHaveAttribute("type", "password");
  });

  test("guardar credenciais: segredo nunca é devolvido e o gateway não fica ativo sem ligação verificada", async ({ page }) => {
    await login(page);
    await page.goto("/integracoes");
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
    await expect(page.getByTestId("gateway-e2payments")).toBeVisible();
    await noHorizontalScroll(page);
  });
});
