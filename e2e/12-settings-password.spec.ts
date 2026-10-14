// Configurações simplificadas, alterar palavra-passe e recuperação por link temporário.
// Corre depois de 10 (a conta "Vendedora Um" existe e está aprovada).
import { expect, test } from "@playwright/test";
import { login, noHorizontalScroll, toast, USER } from "./helpers";

const SELLER = { email: "vendedora.um@ntp.local", password: "vendedora-pass-123" };
const NEW_PASSWORD = "nova-palavra-passe-456";

test.describe.serial("configurações e palavra-passe", () => {
  test("configurações: só conta, idioma, moeda e fuso horário; o nome fica guardado", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
    const form = page.getByTestId("account-settings");
    await expect(page.getByTestId("account-email")).toHaveValue(USER.email);
    await expect(page.getByTestId("account-email")).toHaveAttribute("readonly", "");
    // removidos: nome do negócio e email de suporte
    await expect(page.getByLabel(/Nome do negócio/)).toHaveCount(0);
    await expect(page.getByLabel(/Email de suporte/i)).toHaveCount(0);
    await expect(form.locator("input:not([readonly]), select")).toHaveCount(4);

    await page.getByLabel("Nome do utilizador").fill("Proprietário E2E");
    await page.getByLabel("Idioma").selectOption("pt-PT");
    await form.getByRole("button", { name: "Guardar alterações" }).click();
    await toast(page, "Configurações guardadas");
    await page.reload();
    await expect(page.getByLabel("Nome do utilizador")).toHaveValue("Proprietário E2E");
    await expect(page.getByLabel("Idioma")).toHaveValue("pt-PT");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");
    // repor
    await page.getByLabel("Idioma").selectOption("pt-MZ");
    await form.getByRole("button", { name: "Guardar alterações" }).click();
    await toast(page, "Configurações guardadas");

    // segurança: só "Alterar palavra-passe" (num diálogo) e "Esqueceu-se da palavra-passe?"
    await expect(page.getByTestId("password-form")).toHaveCount(0);
    await page.getByTestId("change-password").click();
    await expect(page.getByRole("dialog").getByTestId("password-form")).toBeVisible();
    await page.getByRole("dialog").getByLabel("Palavra-passe atual").fill("errada-1234567");
    await page.getByRole("dialog").getByLabel("Nova palavra-passe", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("dialog").getByLabel("Confirmar nova palavra-passe").fill("outra-coisa-999");
    await page.getByRole("dialog").getByRole("button", { name: "Alterar palavra-passe" }).click();
    await expect(page.getByRole("dialog")).toContainText("não coincidem");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("forgot-password")).toHaveAttribute("href", "/recuperar");
  });

  test("recuperar: resposta genérica, sem revelar se a conta existe", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId("forgot-link").click();
    await expect(page).toHaveURL(/\/recuperar$/);
    await page.getByLabel("Email").fill("nao-existe@ntp.local");
    await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
    await expect(page.getByTestId("reset-requested")).toContainText("Se existir uma conta com este email");
    // sem fornecedor de email configurado no ambiente de teste: explica a alternativa
    await expect(page.getByTestId("reset-email-unavailable")).toBeVisible();

    await page.goto("/recuperar");
    await page.getByLabel("Email").fill(SELLER.email);
    await page.getByRole("button", { name: "Enviar link de redefinição" }).click();
    await expect(page.getByTestId("reset-requested")).toContainText("Se existir uma conta com este email");

    await page.goto("/redefinir/token-falso-que-nao-existe-1234567890ab");
    await expect(page.getByTestId("reset-invalid")).toBeVisible();
  });

  test("link de redefinição gerado na Administração: funciona uma vez e termina as sessões", async ({ page, browser }) => {
    // a vendedora tem uma sessão aberta noutro dispositivo
    const other = await browser.newContext();
    const sellerPage = await other.newPage();
    await sellerPage.goto("/login");
    await sellerPage.getByLabel("Email").fill(SELLER.email);
    await sellerPage.getByLabel("Password").fill(SELLER.password);
    await sellerPage.getByRole("button", { name: "Entrar" }).click();
    await expect(sellerPage).toHaveURL(/\/dashboard/);

    await login(page);
    await page.goto(`/admin/utilizadores?q=${encodeURIComponent(SELLER.email)}`);
    await page.getByTestId("admin-user-link").first().click();
    await page.getByTestId("admin-reset-link").click();
    const link = (await page.getByTestId("admin-reset-link-value").textContent())!.trim();
    expect(link).toMatch(/\/redefinir\/[A-Za-z0-9_-]{40,}$/);

    const ctx = await browser.newContext();
    const anon = await ctx.newPage();
    await anon.goto(new URL(link).pathname);
    await anon.getByLabel("Nova palavra-passe", { exact: true }).fill(NEW_PASSWORD);
    await anon.getByLabel("Confirmar nova palavra-passe").fill(NEW_PASSWORD);
    await anon.getByRole("button", { name: "Guardar nova palavra-passe" }).click();
    await expect(anon).toHaveURL(/\/login/);

    // a sessão antiga terminou
    await sellerPage.goto("/dashboard");
    await expect(sellerPage).toHaveURL(/\/login/);
    // a palavra-passe antiga deixou de funcionar; a nova funciona
    await anon.getByLabel("Email").fill(SELLER.email);
    await anon.getByLabel("Password").fill(SELLER.password);
    await anon.getByRole("button", { name: "Entrar" }).click();
    await expect(anon.getByRole("alert").filter({ hasText: /incorretos/ }).first()).toBeVisible();
    await anon.getByLabel("Password").fill(NEW_PASSWORD);
    await anon.getByRole("button", { name: "Entrar" }).click();
    await expect(anon).toHaveURL(/\/dashboard/);
    // o mesmo link não pode ser usado outra vez
    await anon.goto(new URL(link).pathname);
    await expect(anon.getByTestId("reset-invalid")).toBeVisible();
    await ctx.close();
    await other.close();
  });

  test("telemóvel: configurações, produtos, funis e recuperação sem deslocamento horizontal", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page);
    for (const path of ["/configuracoes", "/produtos", "/funis"]) {
      await page.goto(path);
      await expect(page.locator("main")).toBeVisible();
      await noHorizontalScroll(page);
    }
    await page.goto("/funis");
    await page.getByTestId("funnel-card-status").first().waitFor();
    await page.getByRole("link", { name: /Funil — Ebook Moçambique/ }).first().click();
    await expect(page.getByTestId("requirements-panel")).toBeVisible();
    await noHorizontalScroll(page);
    await ctx.clearCookies();
    await page.goto("/recuperar");
    await noHorizontalScroll(page);
    await ctx.close();
  });
});
