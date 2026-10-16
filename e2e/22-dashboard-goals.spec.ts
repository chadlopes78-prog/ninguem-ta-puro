// Dashboard: barra de meta de faturamento (valores reais) e atividades de hoje; celebração não se repete.
import { expect, test } from "@playwright/test";
import { login, noHorizontalScroll } from "./helpers";

test.describe("Dashboard: meta de faturamento e atividades de hoje", () => {
  test("barra de meta acima das atividades, com valores, percentagem e texto do que falta", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    const goal = page.getByTestId("revenue-goal");
    await expect(goal).toContainText("Meta de faturamento");
    await expect(page.getByTestId("revenue-goal-revenue")).toHaveText(/^[\d.]+ MZN$/);
    await expect(page.getByTestId("revenue-goal-target")).toHaveText(/^(10|50|100|500)\.000 MZN$|^1\.000\.000 MZN$/);
    const percent = Number((await page.getByTestId("revenue-goal-percent").textContent())!.replace("%", ""));
    expect(percent).toBeGreaterThanOrEqual(0);
    expect(percent).toBeLessThanOrEqual(100);
    await expect(page.getByTestId("revenue-goal-bar")).toHaveAttribute("aria-valuenow", String(percent));
    await expect(page.getByTestId("revenue-goal-remaining")).toHaveText(/Faltam [\d.]+ MZN para atingir a tua (primeira|segunda|terceira|quarta|quinta) meta\.|meta máxima/);

    const activity = page.getByTestId("today-activity");
    await expect(activity).toContainText("Atividades recentes");
    // a barra vem antes das atividades
    const [g, a] = await Promise.all([goal.boundingBox(), activity.boundingBox()]);
    expect(g!.y).toBeLessThan(a!.y);
  });

  test("uma celebração já apresentada não volta a aparecer depois de recarregar", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await expect(page.getByTestId("revenue-goal")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.reload();
    await expect(page.getByTestId("revenue-goal")).toBeVisible();
    await expect(page.getByTestId("revenue-goal-celebration")).toHaveCount(0);
  });

  for (const width of [375, 768, 1280]) {
    test(`responsivo a ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await login(page);
      await page.goto("/dashboard");
      await expect(page.getByTestId("revenue-goal-bar")).toBeVisible();
      await noHorizontalScroll(page);
    });
  }
});
