// Auditoria de interface (corre no fim, com os dados criados pelos outros testes): todas as páginas do painel
// e as páginas públicas em larguras de telemóvel, tablet e computador. Procura deslocamento horizontal,
// conteúdo fora do ecrã, textos cortados/invisíveis/minúsculos, controlos de toque demasiado pequenos e
// erros na consola. Com AUDIT_REPORT=<ficheiro> grava um relatório em vez de falhar (diagnóstico).
import { writeFileSync } from "fs";
import { expect, test, type Page } from "@playwright/test";
import { login } from "./helpers";

const WIDTHS = [320, 360, 375, 390, 414, 430, 768, 1024, 1280, 1366, 1440, 1920];
const REPORT = process.env.AUDIT_REPORT;
const findings: Record<string, string[]> = {};
const hydrationRetries: string[] = [];

/** Páginas a auditar; as de detalhe são descobertas a partir das listas (dados reais dos testes anteriores). */
async function discover(page: Page) {
  const first = async (list: string, sel: string) => {
    await page.goto(list);
    const href = await page.locator(sel).first().getAttribute("href").catch(() => null);
    return href;
  };
  const paths = ["/dashboard", "/produtos", "/produtos/novo", "/funis", "/checkouts", "/pedidos", "/clientes", "/relatorios", "/notificacoes", "/integracoes", "/configuracoes", "/admin", "/admin/utilizadores"];
  const extra = [
    await first("/produtos", "table a[href^='/produtos/c']"),
    await first("/funis", "a[href^='/funis/c']"),
    await first("/pedidos", "table a[href^='/pedidos/c']"),
    await first("/clientes", "table a[href^='/clientes/c']"),
    await first("/admin/utilizadores", "[data-testid=admin-user-link]"),
    await first("/checkouts", "[data-testid=personalize]"),
  ].filter((x): x is string => !!x);
  return [...paths, ...extra];
}

async function problems(page: Page, width: number) {
  return page.evaluate((vw) => {
    const out: string[] = [];
    const doc = document.documentElement;
    if (doc.scrollWidth > vw + 1) out.push(`deslocamento horizontal: ${doc.scrollWidth}px > ${vw}px`);
    const label = (e: Element) => ((e as HTMLElement).innerText || e.getAttribute("aria-label") || e.getAttribute("title") || e.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
    const visible = (e: HTMLElement) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0.05;
    };
    const skip = (e: Element) => !!e.closest(".sr-only, [aria-hidden=true], [data-editor-canvas]");
    // dentro de uma área com deslocamento lateral próprio (faixa de chips, tabela larga): avaliada à parte
    const inScroller = (e: Element) => {
      for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll") return true;
      }
      return false;
    };
    for (const e of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const o = getComputedStyle(e).overflowX;
      if ((o === "auto" || o === "scroll") && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0 && !e.closest("[data-editor-canvas]") && !e.matches("textarea"))
        out.push(`área com deslocamento lateral (${e.clientWidth}px, conteúdo ${e.scrollWidth}px): ${e.tagName.toLowerCase()}.${String(e.className).split(" ").slice(0, 3).join(".")} — "${label(e).slice(0, 30)}"`);
    }
    for (const e of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (skip(e) || !visible(e)) continue;
      const cs = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      const ownText = Array.from(e.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim().length > 1);
      if (ownText) {
        if (r.right > vw + 1 && cs.position !== "fixed" && !inScroller(e)) out.push(`texto fora do ecrã: "${label(e)}"`);
        if (e.scrollWidth > e.clientWidth + 2 && cs.overflowX !== "visible" && cs.textOverflow !== "ellipsis" && !e.matches("input,textarea,select,option")) out.push(`texto cortado: "${label(e)}"`);
        if (parseFloat(cs.fontSize) < 10.5) out.push(`letra < 10.5px (${cs.fontSize}): "${label(e)}"`);
        if (cs.color === cs.backgroundColor && cs.backgroundColor !== "rgba(0, 0, 0, 0)") out.push(`texto invisível: "${label(e)}"`);
      }
      // controlos interativos: tamanho mínimo de toque (só em larguras de telemóvel/tablet)
      if (vw < 1024 && e.matches("button, a[href], select, input:not([type=hidden]), [role=button], [role=tab], [role=radio], [role=menuitem]")) {
        const inlineLink = e.tagName === "A" && cs.display === "inline";
        // área de toque alargada com ::after absoluto (o ícone mantém o tamanho visual)
        const af = getComputedStyle(e, "::after");
        const grow = af.position === "absolute" && af.content !== "none" ? { x: -parseFloat(af.left) - parseFloat(af.right) || 0, y: -parseFloat(af.top) - parseFloat(af.bottom) || 0 } : { x: 0, y: 0 };
        const w = r.width + Math.max(0, grow.x);
        const h = r.height + Math.max(0, grow.y);
        if (!inlineLink && (h < 28 || w < 28) && !e.matches("input[type=radio], input[type=checkbox]")) out.push(`alvo de toque pequeno (${Math.round(w)}×${Math.round(h)}): "${label(e)}"`);
        if ((r.right > vw + 1 || r.left < -1) && !inScroller(e)) out.push(`controlo fora do ecrã: "${label(e)}"`);
      }
    }
    return Array.from(new Set(out));
  }, width);
}

test.describe.serial("auditoria de interface", () => {
  let paths: string[] = [];
  test("descobrir páginas", async ({ page }) => {
    await login(page);
    paths = await discover(page);
    expect(paths.length).toBeGreaterThan(15);
  });

  for (const width of WIDTHS) {
    test(`painel a ${width}px`, async ({ browser }) => {
      test.setTimeout(240_000);
      const ctx = await browser.newContext({ viewport: { width, height: width < 768 ? 800 : 900 }, isMobile: width < 768, hasTouch: width < 1024 });
      const page = await ctx.newPage();
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (m) => {
        if (m.type() === "error" && !/Failed to load resource|favicon/i.test(m.text())) errors.push(`console: ${m.text().slice(0, 160)}`);
      });
      await login(page);
      for (const path of paths) {
        errors.length = 0;
        await page.goto(path);
        await page.waitForLoadState("networkidle").catch(() => undefined);
        // Erro de hidratação intermitente (React #418) observado raramente em /relatorios e não reproduzido em
        // 60+ carregamentos: é registado (hydrationRetries) e a página é recarregada uma vez; se repetir, falha.
        if (errors.length && errors.every((e) => /React error #418/.test(e))) {
          hydrationRetries.push(`${width}px ${path}`);
          errors.length = 0;
          await page.reload();
          await page.waitForLoadState("networkidle").catch(() => undefined);
        }
        const found = [...(await problems(page, width)), ...errors];
        if (found.length) findings[`${width}px ${path}`] = found;
      }
      // páginas públicas
      for (const path of ["/checkout/ebook-mocambique", "/login", "/registo", "/recuperar"]) {
        await ctx.clearCookies();
        errors.length = 0;
        await page.goto(path);
        await page.waitForLoadState("networkidle").catch(() => undefined);
        const found = [...(await problems(page, width)), ...errors];
        if (found.length) findings[`${width}px ${path}`] = found;
      }
      await ctx.close();
      if (!REPORT) expect(Object.entries(findings).filter(([k]) => k.startsWith(`${width}px`)), JSON.stringify(findings, null, 1)).toEqual([]);
    });
  }

  test.afterAll(() => {
    if (hydrationRetries.length) console.log(`[auditoria] erro de hidratação intermitente (recarregado 1×): ${hydrationRetries.join(", ")}`);
    if (REPORT) writeFileSync(REPORT, JSON.stringify({ ...findings, _hydrationRetries: hydrationRetries }, null, 1));
  });
});
