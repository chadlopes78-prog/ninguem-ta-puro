// Área Operações: uma única entrada no menu com abas (Pedidos, Clientes, Relatórios, Notificações).
// As rotas antigas continuam a funcionar e as outras entradas do menu mantêm nome e ordem.
import { expect, test } from "@playwright/test";
import { login, noHorizontalScroll } from "./helpers";

const TABS = [
  { key: "pedidos", path: "/pedidos", heading: /Pedidos/ },
  { key: "clientes", path: "/clientes", heading: /Clientes/ },
  { key: "relatorios", path: "/relatorios", heading: /Relatórios/ },
  { key: "notificacoes", path: "/notificacoes", heading: /Notificações/ },
];

test.describe("Operações", () => {
  test("menu: entrada única Operações; restantes entradas inalteradas e pela mesma ordem", async ({ page }) => {
    await login(page);
    const menu = page.getByRole("navigation", { name: "Navegação principal" });
    const labels = (await menu.getByRole("link").allInnerTexts()).map((t) => t.replace(/\s*\d+\+?$/, "").trim());
    expect(labels.slice(0, 7)).toEqual(["Dashboard", "Produtos", "Personalizar Checkout", "Funis de vendas", "Operações", "Integrações", "Configurações"]);
    for (const old of ["Pedidos", "Clientes", "Relatórios", "Notificações"]) await expect(menu.getByRole("link", { name: old, exact: true })).toHaveCount(0);
    await menu.getByRole("link", { name: "Operações" }).click();
    await expect(page).toHaveURL(/\/pedidos$/);
    await expect(page.getByTestId("operations-title")).toHaveText("Operações");
    await expect(menu.getByRole("link", { name: "Operações" })).toHaveAttribute("aria-current", "page");
  });

  test("cada aba abre a sua página, fica selecionada e mantém-se depois de recarregar", async ({ page }) => {
    await login(page);
    await page.goto("/operacoes");
    await expect(page).toHaveURL(/\/pedidos$/);
    for (const t of TABS) {
      await page.getByTestId(`ops-tab-${t.key}`).click();
      await expect(page).toHaveURL(new RegExp(`${t.path}$`));
      await expect(page.getByRole("heading", { level: 1, name: t.heading })).toBeVisible();
      await expect(page.getByTestId(`ops-tab-${t.key}`)).toHaveAttribute("aria-current", "page");
      await page.reload();
      await expect(page.getByTestId(`ops-tab-${t.key}`)).toHaveAttribute("aria-current", "page");
      await expect(page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", { name: "Operações" })).toHaveAttribute("aria-current", "page");
    }
  });

  test("links antigos continuam a funcionar (incluindo filtros e detalhes)", async ({ page }) => {
    await login(page);
    await page.goto("/pedidos?status=PAID");
    await expect(page.getByTestId("ops-tab-pedidos")).toHaveAttribute("aria-current", "page");
    await page.goto("/relatorios?periodo=30d");
    await expect(page.getByTestId("ops-tab-relatorios")).toHaveAttribute("aria-current", "page");
    await page.goto("/notificacoes");
    await expect(page.getByTestId("ops-tab-notificacoes")).toHaveAttribute("aria-current", "page");
    // as outras áreas não ganham as abas de Operações
    for (const path of ["/dashboard", "/produtos", "/checkouts", "/funis", "/integracoes", "/configuracoes"]) {
      await page.goto(path);
      await expect(page.getByTestId("operations-tabs")).toHaveCount(0);
    }
  });

  test("telemóvel: todas as abas visíveis, sem cortes nem deslocamento horizontal", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await login(page);
    await page.getByRole("button", { name: "Abrir menu" }).tap();
    await page.getByRole("dialog", { name: "Menu" }).getByRole("link", { name: "Operações" }).tap();
    await expect(page).toHaveURL(/\/pedidos$/);
    const vw = page.viewportSize()!.width;
    for (const t of TABS) {
      const box = (await page.getByTestId(`ops-tab-${t.key}`).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vw);
      const clipped = await page.getByTestId(`ops-tab-${t.key}`).evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(clipped).toBe(false);
    }
    await page.getByTestId("ops-tab-clientes").tap();
    await expect(page).toHaveURL(/\/clientes$/);
    await noHorizontalScroll(page);
    await ctx.close();
  });
});
