import { expect, type Page } from "@playwright/test";

export const USER = { email: "e2e@ntp.local", password: "e2e-password-123" };

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(USER.email);
  await page.getByLabel("Password").fill(USER.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

export async function noHorizontalScroll(page: Page) {
  const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, `scrollWidth ${sw} > innerWidth ${iw}`).toBeLessThanOrEqual(iw + 1);
}

export async function toast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible();
}

/** Valor em metical formatado (o separador de milhares é um espaço não separável). */
export function mzn(value: string): RegExp {
  // pt-MZ não agrupa números de 4 dígitos ("1250,00 MZN") mas agrupa a partir de 5 ("12 450,00 MZN")
  return new RegExp(value.replace(/[.]/g, "\\.").replace(/ /g, "\\s?") + "\\sMZN");
}
