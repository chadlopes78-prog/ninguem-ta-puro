// Revisão da experiência no telemóvel (corre no fim, com os dados criados pelos outros testes):
// aba Produtos, produto, funis, editor e checkout público em várias larguras — sem deslocamento horizontal,
// sem textos fora dos cartões, sem letras minúsculas e com botões fáceis de tocar.
import { expect, test, type Page } from "@playwright/test";
import { login, noHorizontalScroll } from "./helpers";

const WIDTHS = [320, 375, 414];
const SHOTS = process.env.E2E_SHOTS_DIR;

/** Elementos visíveis com texto que saem do ecrã, que ficam cortados sem reticências ou com letra < 11 px. */
async function textProblems(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const vw = window.innerWidth;
    const all = Array.from(document.querySelectorAll<HTMLElement>("main *, [data-testid=checkout-root] *"));
    for (const e of all) {
      const own = Array.from(e.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim().length > 0);
      if (!own) continue;
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      if (e.closest(".sr-only, [aria-hidden=true], [data-editor-canvas], .md\\:block:not(.block)")) continue;
      // fora da página visível (para a direita)
      if (r.right > vw + 1 && cs.position !== "fixed") out.push(`fora do ecrã: "${e.textContent!.trim().slice(0, 40)}" (${Math.round(r.right)} > ${vw})`);
      // cortado sem reticências (o "truncate" mostra "…", é intencional)
      if (e.scrollWidth > e.clientWidth + 2 && cs.overflow !== "visible" && cs.textOverflow !== "ellipsis" && !e.matches("input, textarea, select")) out.push(`texto cortado: "${e.textContent!.trim().slice(0, 40)}"`);
      const fs = parseFloat(cs.fontSize);
      if (fs < 10.5) out.push(`letra demasiado pequena (${fs}px): "${e.textContent!.trim().slice(0, 40)}"`);
      // texto com a mesma cor do fundo do próprio elemento
      if (cs.color === cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") out.push(`texto invisível: "${e.textContent!.trim().slice(0, 40)}"`);
    }
    return out;
  });
}

async function review(page: Page, name: string, width: number) {
  await noHorizontalScroll(page);
  expect(await textProblems(page), `${name} @ ${width}px`).toEqual([]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}-${width}.png`, fullPage: true });
}

test.describe.serial("revisão mobile", () => {
  for (const width of WIDTHS) {
    test(`painel e checkout a ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await login(page);

      // aba Produtos: cartões com nome, preço, estado, aviso de configuração e menu de ações
      await page.goto("/produtos");
      const cards = page.locator("ul.lg\\:hidden > li");
      await expect(cards.first()).toBeVisible();
      await review(page, "produtos", width);
      const first = cards.first();
      await expect(first.getByTestId("product-stage")).toBeVisible();
      const menu = first.getByRole("button", { name: /Ações para/ });
      await expect(menu).toBeVisible();
      const mb = (await menu.boundingBox())!;
      expect(mb.x + mb.width).toBeLessThanOrEqual(width);
      expect(Math.max(mb.width, mb.height)).toBeGreaterThanOrEqual(32);
      // cada cartão fica dentro da largura do ecrã
      for (const c of await cards.all()) {
        const b = (await c.boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(width + 0.5);
      }
      // aviso de produto incompleto legível (há sempre pelo menos um produto incompleto nos dados de teste?)
      const warn = page.locator("ul.lg\\:hidden").getByTestId("product-incomplete");
      if (await warn.count()) {
        const wb = (await warn.first().boundingBox())!;
        expect(wb.x + wb.width).toBeLessThanOrEqual(width);
        await expect(warn.first()).toHaveAttribute("href", /\/produtos\/[a-z0-9]+#entrega/);
      }
      await menu.click();
      await expect(page.getByRole("menuitem", { name: "Editar" })).toBeVisible();
      await page.keyboard.press("Escape");

      // detalhe do produto
      await first.getByRole("link").first().click();
      await expect(page).toHaveURL(/\/produtos\/[a-z0-9]+$/);
      await expect(page.getByLabel("Nome do produto")).toBeVisible();
      await review(page, "produto", width);

      // funis
      await page.goto("/funis");
      await review(page, "funis", width);

      // editor do checkout (telemóvel): página, elementos e propriedades
      await page.goto("/checkouts");
      await page.getByTestId("personalize").first().click();
      await expect(page.getByTestId("checkout-editor")).toBeVisible();
      await noHorizontalScroll(page);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-pagina-${width}.png` });
      await page.getByTestId("pane-library").click();
      await expect(page.getByTestId("lib-countdown")).toBeVisible();
      await noHorizontalScroll(page);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-elementos-${width}.png` });
      await page.getByTestId("pane-props").click();
      await expect(page.getByTestId("page-properties")).toBeVisible();
      await noHorizontalScroll(page);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/editor-estilo-${width}.png` });

      // checkout público: largura total, margens, textos legíveis, botão fácil de tocar, sem resumo duplicado
      await page.goto("/checkout/ebook-mocambique");
      await expect(page.getByTestId("purchase-form")).toBeVisible();
      await review(page, "checkout", width);
      const form = (await page.getByTestId("purchase-form").boundingBox())!;
      expect(form.x).toBeGreaterThanOrEqual(8);
      expect(width - (form.x + form.width)).toBeGreaterThanOrEqual(8);
      expect(form.width).toBeGreaterThanOrEqual(width - 48);
      await expect(page.getByTestId("order-summary")).toHaveCount(1);
      const buy = page.getByRole("button", { name: /Finalizar compra|Pagar agora/ });
      expect((await buy.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      for (const input of await page.getByTestId("purchase-form").locator("input:visible:not([type=radio]):not([type=checkbox])").all()) {
        expect(parseFloat(await input.evaluate((e) => getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16); // < 16 px faz o iPhone ampliar a página ao tocar
      }
      await ctx.close();
    });
  }

  for (const width of [1024, 1280, 1440]) {
    test(`aba Produtos no computador a ${width}px: tabela cabe sem deslocamento e o menu de ações fica visível`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await login(page);
      await page.goto("/produtos");
      const table = page.locator("table");
      await expect(table).toBeVisible();
      await noHorizontalScroll(page);
      // a tabela não precisa de deslocamento lateral dentro do cartão
      expect(await table.evaluate((t) => t.parentElement!.scrollWidth <= t.parentElement!.clientWidth + 1)).toBe(true);
      const menu = table.getByRole("button", { name: /Ações para/ }).first();
      await expect(menu).toBeInViewport();
      await expect(table.getByRole("button", { name: "Copiar link" }).first()).toBeInViewport();
      for (const h of ["Produto", "Preço", "Estado", "Link do checkout"]) await expect(table.getByRole("columnheader", { name: h })).toBeVisible();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/pc-produtos-${width}.png`, fullPage: true });
      await ctx.close();
    });
  }
});
