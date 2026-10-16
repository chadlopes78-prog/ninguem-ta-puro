import { expect, test, type Browser, type Page } from "@playwright/test";
import { login, noHorizontalScroll } from "./helpers";

// Fluxos reais de várias contas: registo pendente → aprovação pelo proprietário → acesso isolado;
// suspensão/desbanimento; rejeição; Administração só para o proprietário.
const SELLER = { name: "Vendedora Um", email: "vendedora.um@ntp.local", password: "vendedora-pass-123" };
const REJECTED = { name: "Candidato Rejeitado", email: "rejeitado@ntp.local", password: "rejeitado-pass-123" };

async function register(page: Page, u: typeof SELLER) {
  await page.goto("/login");
  await page.getByTestId("register-link").click();
  await expect(page).toHaveURL(/\/registo/);
  await page.getByLabel("Nome completo").fill(u.name);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password", { exact: true }).fill(u.password);
  await page.getByLabel("Confirmar password").fill(u.password);
  await page.getByRole("button", { name: "Pedir acesso" }).click();
  await expect(page).toHaveURL(/\/conta/);
}

async function signIn(page: Page, u: typeof SELLER, expected: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(expected);
}

async function ownerOpensUser(browser: Browser, email: string) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await login(page);
  await page.goto(`/admin/utilizadores?q=${encodeURIComponent(email)}`);
  await page.getByTestId("admin-user-link").first().click();
  await expect(page.locator("main")).toContainText(email);
  await expect(page.getByTestId("admin-user-detail")).toBeVisible();
  return { ctx, page };
}

test.describe.serial("várias contas, aprovação e Administração da Plataforma", () => {
  test("registo cria conta pendente sem acesso ao painel", async ({ page }) => {
    await register(page, SELLER);
    await expect(page.getByTestId("account-status")).toHaveAttribute("data-state", "pending");
    await expect(page.getByTestId("account-status-title")).toHaveText("A sua conta está pendente de aprovação");
    await expect(page.getByTestId("account-status-badge")).toHaveText("Em análise");
    await expect(page.getByText(SELLER.email)).toBeVisible();
    // nenhuma área privada fica acessível
    for (const path of ["/dashboard", "/produtos", "/integracoes", "/admin"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/conta/);
    }
    // as APIs privadas também recusam a sessão de uma conta não aprovada
    expect((await page.request.get("/api/push/status?id=abcdefghijklmnopqrstu")).status()).toBe(401);
    // verificar novamente mantém o estado; sair termina a sessão
    await page.getByTestId("account-status-refresh").click();
    await expect(page.getByTestId("account-status")).toHaveAttribute("data-state", "pending");
    await page.getByTestId("account-status-logout").click();
    await expect(page).toHaveURL(/\/login/);
    // entrar outra vez leva sempre à página de estado
    await signIn(page, SELLER, /\/conta/);
  });

  test("proprietário vê o pedido e aprova; a conta entra sem novo registo e vê só os seus dados", async ({ page, browser }) => {
    await signIn(page, SELLER, /\/conta/);
    const owner = await browser.newContext();
    const op = await owner.newPage();
    await login(op);
    await expect(op.getByTestId("pending-approvals-badge").first()).toHaveText("1");
    await op.goto("/admin");
    await expect(op.getByRole("heading", { name: "Administração da Plataforma" })).toBeVisible();
    await expect(op.getByTestId("admin-pending")).toHaveText("1");
    await expect(op.getByTestId("admin-total")).toHaveText("2");
    await op.goto("/admin/utilizadores");
    await op.getByTestId("filter-pending").click();
    await expect(op.getByTestId("admin-users")).toContainText(SELLER.email);
    await expect(op.getByTestId("admin-users")).not.toContainText("e2e@ntp.local");
    await op.getByTestId("admin-user-link").first().click();
    await expect(op.locator("main")).toContainText(SELLER.email);
    await expect(op.getByTestId("admin-user-detail")).toBeVisible();
    await op.getByTestId("admin-approve").click();
    await expect(op.getByTestId("admin-ban")).toBeVisible();
    await expect(op.getByTestId("admin-history")).toContainText(/aprov/i);
    await owner.close();

    // a conta aprovada entra (verificar novamente) sem novo registo
    await page.getByTestId("account-status-refresh").click();
    await expect(page).toHaveURL(/\/dashboard/);
    // não vê a Administração nem os dados do proprietário
    await expect(page.getByRole("link", { name: "Administração" })).toHaveCount(0);
    const res = await page.goto("/admin");
    expect(res?.status()).toBe(404);
    await page.goto("/produtos");
    await expect(page.getByText("Ainda não tem produtos")).toBeVisible();
    // integrações próprias: formulário EPay vazio (nunca herda a chave do proprietário)
    await page.goto("/integracoes/epay");
    await expect(page.getByTestId("epay-form")).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/sk_(test|live)_[A-Za-z0-9]{6,}/);
  });

  test("banir termina as sessões e bloqueia; desbanir devolve o acesso aprovado", async ({ page, browser }) => {
    await signIn(page, SELLER, /\/dashboard/);
    const { ctx, page: op } = await ownerOpensUser(browser, SELLER.email);
    await op.getByTestId("admin-ban").click();
    await op.getByRole("dialog").getByRole("button", { name: "Suspender" }).click();
    await expect(op.getByTestId("admin-unban")).toBeVisible();

    // a sessão ativa terminou
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    await signIn(page, SELLER, /\/conta/);
    await expect(page.getByTestId("account-status")).toHaveAttribute("data-state", "banned");
    await expect(page.getByTestId("account-status-title")).toHaveText("A sua conta foi suspensa");
    await page.goto("/produtos");
    await expect(page).toHaveURL(/\/conta/);

    await op.getByTestId("admin-unban").click();
    await expect(op.getByTestId("admin-ban")).toBeVisible();
    await ctx.close();
    await page.getByTestId("account-status-refresh").click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("rejeição com confirmação mostra a página de candidatura rejeitada", async ({ page, browser }) => {
    await register(page, REJECTED);
    const { ctx, page: op } = await ownerOpensUser(browser, REJECTED.email);
    await op.getByTestId("admin-reject").click();
    await expect(op.getByRole("dialog")).toContainText("Rejeitar candidatura");
    await op.getByRole("dialog").getByRole("button", { name: "Rejeitar conta" }).click();
    await expect(op.getByTestId("admin-approve")).toBeVisible();
    await expect(op.getByTestId("admin-reject")).toHaveCount(0);
    await ctx.close();
    await page.getByTestId("account-status-refresh").click();
    await expect(page.getByTestId("account-status")).toHaveAttribute("data-state", "rejected");
    await expect(page.getByTestId("account-status-title")).toHaveText("A sua candidatura foi rejeitada");
    await expect(page.getByTestId("account-status-badge")).toHaveText("Rejeitada");
  });

  test("Administração e página de estado no telemóvel", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page);
    for (const path of ["/admin", "/admin/utilizadores"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await noHorizontalScroll(page);
    }
    await ctx.close();
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const p2 = await c2.newPage();
    await signIn(p2, REJECTED, /\/conta/);
    await noHorizontalScroll(p2);
    await c2.close();
  });
});
