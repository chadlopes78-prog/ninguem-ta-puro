// Partilha das credenciais de pagamento do administrador: conceder (Administração → Integrações partilhadas),
// o utilizador vê a integração sem credenciais, pede a remoção, o administrador vê o pedido e revoga.
// Corre depois de 10 e 12 (a conta "Vendedora Um" está aprovada e com a palavra-passe redefinida).
import { expect, test, type Page } from "@playwright/test";
import { login, noHorizontalScroll, toast } from "./helpers";

// palavra-passe redefinida na spec 12
const SELLER = { email: "vendedora.um@ntp.local", password: "nova-palavra-passe-456" };

async function sellerLogin(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(SELLER.email);
  await page.getByLabel("Password").fill(SELLER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test.describe.serial("partilha das credenciais de pagamento", () => {
  test("administrador: Integrações → partilhar; pesquisar, escolher utilizador e conceder EPay", async ({ page }) => {
    await login(page);
    await page.goto("/integracoes");
    await page.getByTestId("share-credentials-link").click();
    await expect(page).toHaveURL(/\/admin\/integracoes/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Partilhar acesso às minhas credenciais de pagamento");
    await page.getByTestId("grant-search").fill("vendedora.um");
    await page.getByRole("button", { name: "Pesquisar" }).click();
    await page.getByTestId("grant-user").filter({ hasText: SELLER.email }).click();
    await expect(page.getByTestId("grant-panel")).toContainText(SELLER.email);
    await expect(page.getByTestId("grant-submit")).toBeDisabled();
    await page.getByTestId("grant-epay").check();
    await page.getByTestId("grant-submit").click();
    await toast(page, "Acesso concedido: EPay");
    const row = page.getByTestId("grants-list").locator("tr").filter({ hasText: SELLER.email }).filter({ hasText: "EPay" });
    await expect(row.getByTestId("grant-status")).toContainText("Ativa");
    await expect(page.getByTestId("grant-epay")).toBeDisabled(); // já autorizado
    // a página não contém credenciais nem campos de credenciais
    await expect(page.locator("input[type=password]")).toHaveCount(0);
  });

  test("utilizador: vê EPay disponibilizada pelo administrador, sem credenciais; pede a remoção", async ({ page }) => {
    await sellerLogin(page);
    await page.goto("/integracoes");
    const card = page.getByTestId("shared-epay");
    await expect(card).toContainText("Método disponibilizado pelo administrador.");
    await expect(card).toContainText("Credenciais: Geridas pelo administrador.");
    await expect(card.locator("input, textarea")).toHaveCount(0);
    await expect(card.getByRole("link", { name: /Configurar/ })).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toMatch(/sk_(test|live)_/);
    await card.getByTestId("shared-request-removal-epay").click();
    await expect(page.getByRole("dialog")).toContainText("Tem a certeza de que deseja solicitar a remoção desta integração? O administrador será informado.");
    await page.getByRole("dialog").getByRole("button", { name: "Solicitar remoção" }).click();
    await toast(page, "O administrador foi informado");
    await expect(card.getByTestId("shared-status")).toHaveText("Remoção solicitada");
    await page.reload();
    await expect(page.getByTestId("shared-epay").getByTestId("shared-status")).toHaveText("Remoção solicitada");
    // sem opções de levantamento
    await expect(page.getByText(/levantamento|levantar|saque/i)).toHaveCount(0);
    // não acede à área de partilha do administrador
    const r = await page.goto("/admin/integracoes");
    expect(r?.status()).toBe(404);
  });

  test("administrador: vê o pedido, revoga; o utilizador deixa de ver a integração", async ({ page, browser }) => {
    await login(page);
    await page.goto("/admin/integracoes");
    const row = page.getByTestId("grants-list").locator("tr").filter({ hasText: SELLER.email }).filter({ hasText: "EPay" }).first();
    await expect(row.getByTestId("grant-status")).toContainText("Remoção solicitada");
    await row.getByTestId("grant-revoke").click();
    await page.getByRole("dialog").getByRole("button", { name: "Revogar acesso" }).click();
    await toast(page, "Acesso revogado");
    await expect(page.getByTestId("grants-list").locator("tr").filter({ hasText: SELLER.email }).first().getByTestId("grant-status")).toContainText("Revogada");

    const ctx = await browser.newContext();
    const p2 = await ctx.newPage();
    await sellerLogin(p2);
    await p2.goto("/integracoes");
    await expect(p2.getByTestId("shared-epay")).toHaveCount(0);
    await expect(p2.getByTestId("integration-epay")).toBeVisible(); // as credenciais próprias continuam disponíveis
    await ctx.close();
  });

  test("telemóvel: área de partilha sem deslocamento horizontal", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page);
    await page.goto("/admin/integracoes");
    await expect(page.getByTestId("grants-list")).toBeVisible();
    await noHorizontalScroll(page);
    await ctx.close();
  });
});
