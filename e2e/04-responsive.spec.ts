import { expect, test } from "@playwright/test";
import { login, noHorizontalScroll } from "./helpers";

const WIDTHS = [320, 375, 390, 768, 1024, 1440];
const ROUTES = ["/dashboard", "/produtos", "/produtos/novo", "/checkouts", "/checkouts/avancado", "/checkouts/novo", "/funis", "/pedidos", "/clientes", "/cupons", "/cupons/novo", "/relatorios", "/notificacoes", "/integracoes", "/configuracoes"];

test("sem scroll horizontal nas larguras de referência", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  for (const w of WIDTHS) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const r of ROUTES) {
      await page.goto(r);
      await page.waitForLoadState("networkidle");
      await noHorizontalScroll(page);
    }
  }
});

test("navegação mobile com menu lateral", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Cupons" }).click();
  await expect(page).toHaveURL(/\/cupons/);
  await expect(page.getByRole("heading", { name: "Cupons" })).toBeVisible();
});

test("sidebar recolhível no desktop", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();
  await page.getByRole("button", { name: "Expandir menu" }).click();
});

test("construtor de funis utilizável no telemóvel", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await login(page);
  await page.goto("/funis");
  await page.getByRole("button", { name: "Funil avançado" }).first().click();
  await page.getByRole("dialog").getByLabel("Nome").fill("Funil Mobile");
  await page.getByRole("button", { name: "Criar e abrir editor" }).click();
  await expect(page.getByTestId("funnel-canvas")).toBeVisible();
  const box = await page.getByTestId("funnel-canvas").boundingBox();
  expect(box!.height).toBeGreaterThan(350);
  await page.getByTestId("add-END").click();
  await expect(page.getByTestId("funnel-canvas").locator(".react-flow__node")).toHaveCount(5);
  await noHorizontalScroll(page);
});
