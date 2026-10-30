// Ações reais com toque (simulação de telemóvel 375 px e tablet 768 px no Chromium; não substitui aparelhos
// físicos): menu, criar/editar produto, menu dos cartões, modais, funil, editor do checkout (sem arrastar),
// dicas, período dos relatórios e controlos da Administração. Também verifica que o menu de ações da última
// linha da tabela não fica cortado no computador.
import { expect, test, type Page } from "@playwright/test";
import { login, noHorizontalScroll, toast } from "./helpers";

async function inViewport(page: Page, sel: ReturnType<Page["locator"]>) {
  const b = (await sel.boundingBox())!;
  const vp = page.viewportSize()!;
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.y).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 0.5);
}

for (const device of [
  { name: "telemóvel", width: 375, height: 740 },
  { name: "tablet", width: 768, height: 1024 },
]) {
  test.describe.serial(`toque — ${device.name} ${device.width}px`, () => {
    const make = async (browser: import("@playwright/test").Browser) => {
      const ctx = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && !/Failed to load resource|favicon/i.test(m.text()) && errors.push(m.text()));
      await login(page);
      return { ctx, page, errors };
    };

    test("menu lateral: abrir, navegar e fechar; sem aba Cupons", async ({ browser }) => {
      const { ctx, page, errors } = await make(browser);
      await page.getByRole("button", { name: "Abrir menu" }).tap();
      const menu = page.getByRole("dialog", { name: "Menu" });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole("link", { name: "Cupons" })).toHaveCount(0);
      await menu.getByRole("button", { name: "Fechar menu" }).tap();
      await expect(menu).toHaveCount(0);
      await page.getByRole("button", { name: "Abrir menu" }).tap();
      await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Funis de vendas" }).tap();
      await expect(page).toHaveURL(/\/funis$/);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test("produtos: criar e editar pelo formulário; menu do cartão dentro do ecrã e a funcionar", async ({ browser }) => {
      const { ctx, page, errors } = await make(browser);
      await page.goto("/produtos");
      await page.getByRole("link", { name: "Novo produto" }).tap();
      await expect(page).toHaveURL(/\/produtos\/novo$/);
      await page.getByLabel("Nome do produto").fill(`Produto Toque ${device.width}`);
      await page.getByLabel("Descrição").fill("Criado com toque no ecrã para validar o formulário.");
      await page.getByLabel("Preço principal").fill("99,00");
      await noHorizontalScroll(page);
      await page.getByRole("button", { name: "Guardar rascunho" }).tap();
      await toast(page, "Produto guardado como rascunho");
      await page.getByLabel("Nome do produto").fill(`Produto Toque ${device.width} Editado`);
      await page.getByRole("button", { name: "Actualizar produto" }).tap();
      await toast(page, "Produto atualizado");
      // sem entrega a publicação continua bloqueada (só a entrega é obrigatória)
      await page.getByTestId("publish-product").tap();
      await expect(page.getByRole("alert").filter({ hasText: /Ainda não é possível publicar/ }).first()).toBeVisible();

      await page.goto("/produtos");
      const cards = page.locator("ul.lg\\:hidden > li");
      const last = cards.last();
      await last.scrollIntoViewIfNeeded();
      await last.getByRole("button", { name: /Ações para/ }).tap();
      const menu = page.getByRole("menu");
      await expect(menu).toBeVisible();
      await inViewport(page, menu);
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      const card = cards.filter({ hasText: `Produto Toque ${device.width} Editado` }).first();
      await card.getByRole("button", { name: /Ações para/ }).tap();
      await page.getByRole("menuitem", { name: "Duplicar" }).tap();
      await toast(page, "Produto duplicado");
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test("modal: cabe no ecrã e fecha com o botão; dica abre com toque", async ({ browser }) => {
      const { ctx, page, errors } = await make(browser);
      await page.goto("/configuracoes");
      await page.getByTestId("change-password").tap();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await inViewport(page, dialog);
      const close = dialog.getByRole("button", { name: "Fechar" });
      const cb = (await close.boundingBox())!;
      expect(cb.width).toBeGreaterThanOrEqual(36);
      await close.tap();
      await expect(dialog).toBeHidden();

      // dicas dos indicadores: o toque abre (o iPhone não dá foco a botões) e tocar fora fecha
      await page.goto("/dashboard");
      const help = page.getByRole("button", { name: /Soma dos pedidos aprovados/ });
      await help.tap();
      const tip = page.getByRole("tooltip").filter({ hasText: "Soma dos pedidos aprovados" });
      await expect(tip).toBeVisible();
      await inViewport(page, tip);
      await page.getByRole("heading", { level: 1 }).tap();
      await expect(tip).toBeHidden();

      // período dos relatórios: todas as opções visíveis sem deslocar de lado
      await page.goto("/relatorios");
      const custom = page.getByRole("button", { name: "Personalizado" });
      await inViewport(page, custom);
      await page.getByRole("button", { name: "Ontem" }).tap();
      await expect(page).toHaveURL(/range=yesterday/);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test("funil: etapas acessíveis por toque, editar o suporte e guardar", async ({ browser }) => {
      const { ctx, page, errors } = await make(browser);
      await page.goto("/funis");
      await page.getByRole("link", { name: /Funil — Ebook Moçambique/ }).first().tap();
      const flow = page.getByTestId("funnel-flow");
      for (const b of await flow.getByRole("button").all()) await inViewport(page, b);
      await flow.getByRole("button", { name: /Suporte WhatsApp/ }).tap();
      await page.getByTestId("support-phone").fill("+258 84 123 4567");
      await expect(page.getByTestId("support-test")).toHaveAttribute("href", /^https:\/\/wa\.me\/258841234567/);
      await page.getByTestId("wizard-save").tap();
      await toast(page, "Funil guardado");
      await noHorizontalScroll(page);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test("editor do checkout sem arrastar: adicionar, editar texto, mover com botões e guardar", async ({ browser }) => {
      const { ctx, page, errors } = await make(browser);
      await page.goto("/checkouts");
      await page.getByTestId("personalization-card").filter({ hasText: "Ebook Moçambique" }).getByTestId("personalize").tap();
      await expect(page.getByTestId("checkout-editor")).toBeVisible();
      const tabs = device.width < 1024;
      if (tabs) await page.getByTestId("pane-library").tap();
      await page.getByTestId("lib-heading").tap();
      if (tabs) await page.getByTestId("pane-props").tap();
      await page.getByTestId("element-properties").getByLabel("Título").fill("Oferta especial de hoje");
      if (tabs) await page.getByTestId("pane-canvas").tap();
      const canvas = page.getByTestId("editor-canvas");
      const added = canvas.locator("[data-testid=canvas-element][data-type=heading]").filter({ hasText: "Oferta especial de hoje" });
      await expect(added).toBeVisible();
      const before = await canvas.locator("[data-testid=canvas-element]").evaluateAll((els) => els.map((e) => e.getAttribute("data-editor-element")));
      const id = (await added.getAttribute("data-editor-element"))!;
      // mover para cima com o botão (alternativa ao arrastar em ecrãs táteis)
      await page.getByTestId("el-move-up").tap();
      const after = await canvas.locator("[data-testid=canvas-element]").evaluateAll((els) => els.map((e) => e.getAttribute("data-editor-element")));
      expect(after.indexOf(id)).toBe(before.indexOf(id) - 1);
      await page.getByTestId("save-draft").tap();
      await toast(page, "Rascunho guardado");
      // repõe: elimina o título de teste e guarda
      await canvas.locator(`[data-editor-element="${id}"]`).tap();
      await page.getByTestId("el-delete").tap();
      await page.getByTestId("save-draft").tap();
      await toast(page, "Rascunho guardado");
      await noHorizontalScroll(page);
      expect(errors).toEqual([]);
      await ctx.close();
    });

    test("Administração: separadores visíveis e controlos de um utilizador acessíveis", async ({ browser }) => {
      const { ctx, page, errors } = await make(browser);
      await page.goto("/admin");
      const nav = page.getByRole("navigation", { name: "Administração" });
      for (const l of await nav.getByRole("link").all()) await inViewport(page, l);
      await nav.getByRole("link", { name: "Utilizadores" }).tap();
      await page.getByTestId("admin-user-link").filter({ visible: true }).first().tap();
      await expect(page.getByTestId("admin-user-detail")).toBeVisible();
      await noHorizontalScroll(page);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  });
}

test("computador: o menu de ações da última linha da tabela não fica cortado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await login(page);
  await page.goto("/produtos");
  const rows = page.locator("table tbody tr");
  const btn = rows.last().getByRole("button", { name: /Ações para/ });
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await inViewport(page, menu);
  await expect(page.getByRole("menuitem").last()).toBeInViewport();
  await page.mouse.click(5, 5);
  await expect(menu).toHaveCount(0);
});
