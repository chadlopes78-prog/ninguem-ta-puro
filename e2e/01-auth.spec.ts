import { expect, test } from "@playwright/test";
import { login, USER } from "./helpers";

test.describe("autenticação e autorização", () => {
  test("rotas privadas exigem sessão", async ({ page }) => {
    await page.goto("/produtos");
    await expect(page).toHaveURL(/\/login\?next=%2Fprodutos/);
    const api = await page.request.get("/api/private-check");
    expect(api.status()).toBe(401);
  });

  test("cookie de sessão forjado não dá acesso", async ({ page, context }) => {
    await context.addCookies([{ name: "ntp_session", value: "x".repeat(43), url: "http://localhost:3100" }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("setup bloqueado após criar proprietário", async ({ page }) => {
    await page.goto("/setup");
    await expect(page).toHaveURL(/\/login/);
  });

  test("credenciais erradas mostram erro; corretas entram; terminar sessão", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(USER.email);
    await page.getByLabel("Password").fill("errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Email ou password incorretos" }).first()).toBeVisible();
    await login(page);
    await page.getByRole("button", { name: "Terminar sessão" }).first().click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("webhook sem fornecedor configurado é recusado", async ({ request }) => {
    const r = await request.post("/api/webhooks/stripe", { data: { id: "evt_1", type: "payment.approved" } });
    expect(r.status()).toBe(404);
  });
});
