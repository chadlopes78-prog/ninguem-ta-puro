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

export async function errorToast(page: Page, text: string | RegExp) {
  await expect(page.getByRole("alert").filter({ hasText: text }).first()).toBeVisible();
}

/** Valor em metical formatado (o separador de milhares é um espaço não separável). */
export function mzn(value: string): RegExp {
  // pt-MZ não agrupa números de 4 dígitos ("1250,00 MZN") mas agrupa a partir de 5 ("12 450,00 MZN")
  return new RegExp(value.replace(/[.]/g, "\\.").replace(/ /g, "\\s?") + "\\sMZN");
}

/**
 * Completa a configuração obrigatória de um produto pela interface real e publica-o:
 * criar funil (aba Funis) → suporte WhatsApp → entrega (link externo) → "Guardar e publicar produto".
 * Se já estiver no assistente de funil do produto (ex.: vindo de "Completar configuração"), use `fromWizard`.
 */
export async function completeAndPublish(page: Page, productName: string, opts: { deliveryUrl?: string; whatsapp?: string; message?: string; fromWizard?: boolean } = {}) {
  if (!opts.fromWizard) {
    await page.goto("/funis");
    await page.getByTestId("new-wizard-funnel").first().click();
    await page.getByRole("dialog").getByRole("combobox").selectOption({ label: productName });
    await page.getByTestId("create-wizard-funnel").click();
  }
  await expect(page).toHaveURL(/\/funis\/[a-z0-9]+(#.*)?$/);
  const url = page.url().replace(/#.*$/, "");
  const flow = page.getByTestId("funnel-flow");
  await flow.getByRole("button", { name: /Suporte WhatsApp/ }).click();
  await page.getByTestId("support-phone").fill(opts.whatsapp ?? "84 123 4567");
  if (opts.message) await page.getByLabel("Mensagem inicial (opcional)").fill(opts.message);
  await expect(page.getByTestId("support-test")).toHaveAttribute("href", /^https:\/\/wa\.me\/258841234567/);
  await flow.getByRole("button", { name: /Entrega do produto/ }).click();
  await page.getByTestId("delivery-external").click();
  await page.getByTestId("delivery-url").fill(opts.deliveryUrl ?? "https://conteudo.exemplo.co.mz/acesso");
  await expect(page.getByTestId("delivery-url-test")).toBeVisible();
  await page.getByTestId("wizard-publish").click();
  await toast(page, "Produto publicado");
  return url;
}
