// Verificação do domínio na Pagar: o token guardado na aba Integrações → Pagar é servido, sozinho, em
// /.well-known/pagar-verification.txt apenas no hostname indicado (cada app da Pagar tem o seu hostname).
import { expect, test } from "@playwright/test";
import { login, toast } from "./helpers";

const HOST = "pagamentos-e2e.exemplo.co.mz";
const TOKEN = "pagar-verification=dom_E2eTokenDeVerificacao1234";

test("guardar o token no painel publica-o só no hostname indicado", async ({ page, request }) => {
  const file = (host: string) => request.get("/.well-known/pagar-verification.txt", { headers: { "x-forwarded-host": host } });
  expect((await file(HOST)).status()).toBe(404);

  await login(page);
  await page.goto("/integracoes/pagar");
  await page.getByTestId("pagar-domain").locator("summary").click();
  await page.getByLabel("Hostname registado na Pagar").fill(`https://${HOST}/`);
  await page.getByLabel("Token de verificação").fill(TOKEN.replace("pagar-verification=", ""));
  await page.getByTestId("pagar-domain-save").click();
  await toast(page, /Token publicado/);
  await expect(page.getByTestId("pagar-domain-urls")).toContainText(`https://${HOST}/.well-known/pagar-verification.txt`);
  await expect(page.getByTestId("pagar-domain-urls")).toContainText(`https://${HOST}/api/webhooks/pagar`);

  const ok = await file(HOST);
  expect(ok.status()).toBe(200);
  expect(ok.headers()["content-type"]).toContain("text/plain");
  expect(await ok.text()).toBe(TOKEN);
  // outro hostname não recebe este token
  expect((await file("outro-host.exemplo.co.mz")).status()).toBe(404);
});
