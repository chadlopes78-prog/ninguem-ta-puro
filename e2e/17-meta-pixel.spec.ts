// Facebook Pixel / API de Conversões na página Integrações: guardar ID e token, escolher produtos, persistência
// depois de recarregar, token nunca presente no HTML/respostas, desativar. Nenhum pedido real é enviado à Meta
// (as compras de teste só seriam enviadas com código de eventos de teste).
import { expect, test } from "@playwright/test";
import { login, noHorizontalScroll, toast } from "./helpers";

const TOKEN = "EAAGe2eTOKENnaoDeveAparecer0123456789abcdefXYZ";

test.describe.serial("Pixel da Meta", () => {
  test("configurar Pixel, token e produtos; persiste e o token nunca aparece", async ({ page }) => {
    const bodies: string[] = [];
    page.on("response", async (r) => {
      if (r.request().method() === "POST" || r.url().includes("/integracoes")) bodies.push(await r.text().catch(() => ""));
    });
    await login(page);
    await page.goto("/integracoes");
    await expect(page.getByTestId("integration-meta").getByTestId("integration-status")).toHaveText("Por configurar");
    await page.getByTestId("configure-meta").click();
    await expect(page).toHaveURL(/\/integracoes\/meta$/);
    await expect(page.getByRole("heading", { name: /Facebook Pixel \/ API de Conversões/ })).toBeVisible();
    const card = page.getByTestId("meta-integration");
    await expect(card).toBeVisible();
    await expect(page.getByTestId("meta-status")).toHaveAttribute("data-status", "inactive");
    const f = page.getByTestId("meta-form-new");
    await f.getByLabel("ID do Pixel").fill("abc");
    await f.getByLabel(/Token de acesso/).fill(TOKEN);
    await f.getByTestId("meta-save").click();
    await expect(f.getByText("O ID do Pixel tem só algarismos")).toBeVisible();
    await f.getByLabel("ID do Pixel").fill("123456789012345");
    await f.getByLabel(/Token de acesso/).fill(TOKEN);
    await f.getByLabel("Ebook Moçambique").check();
    await f.getByTestId("meta-save").click();
    await toast(page, "Pixel guardado");

    await page.reload();
    const px = page.getByTestId("meta-pixel-123456789012345");
    await expect(px).toContainText("1 produto(s)");
    await expect(px).toContainText(`••••${TOKEN.slice(-4)}`);
    await expect(page.getByTestId("meta-status")).toHaveAttribute("data-status", "active");
    await px.getByTestId("meta-edit").click();
    const edit = page.getByTestId("meta-form-123456789012345");
    await expect(edit.getByLabel("Ebook Moçambique")).toBeChecked();
    await expect(edit.getByLabel(/Token de acesso/)).toHaveValue(""); // nunca pré-preenchido
    const html = await page.content();
    expect(html).not.toContain(TOKEN);
    expect(html).not.toContain(TOKEN.slice(0, 20));
    for (const b of bodies) expect(b).not.toContain(TOKEN.slice(0, 20));
    await noHorizontalScroll(page);

    // desativar (sem alterar o token): deixa de estar ativa e mantém a seleção
    await edit.getByLabel("Integração ativa").uncheck();
    await edit.getByTestId("meta-save").click();
    await toast(page, "Pixel guardado");
    await page.reload();
    await expect(page.getByTestId("meta-status")).toHaveAttribute("data-status", "inactive");
    await expect(page.getByTestId("meta-pixel-123456789012345")).toContainText("Desativado · 1 produto(s)");
  });

  test("telemóvel: o cartão do Pixel cabe no ecrã", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 760 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page);
    await page.goto("/integracoes");
    await expect(page.getByTestId("integration-meta")).toBeVisible();
    await noHorizontalScroll(page);
    await page.goto("/integracoes/meta");
    await expect(page.getByTestId("meta-integration")).toBeVisible();
    await noHorizontalScroll(page);
    await ctx.close();
  });
});
