// Notificações (central, preferências, PWA/push) e relatórios financeiros no browser.
// O push real depende do serviço de push do navegador (Google/Apple), inacessível neste ambiente: aqui testa-se
// a instalação (manifest/service worker), o fluxo de autorização e os estados de iPhone/Android/recusa.
import { expect, test, type Page } from "@playwright/test";
import { login, mzn, noHorizontalScroll, toast, toPaymentPage, PAY_BUTTON } from "./helpers";

let ip = 0;
async function buy(page: Page, phone: string) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.9.1.${++ip}` });
  await page.goto("/checkout/ebook-mocambique");
  await page.getByLabel("Nome completo").fill("Comprador Alertas");
  await page.getByLabel("Email").fill("alertas@exemplo.co.mz");
  await page.getByLabel(/Número M-Pesa/).fill(phone);
  await page.getByRole("button", { name: PAY_BUTTON }).click();
  await toPaymentPage(page);
}

test.describe.serial("notificações e relatórios", () => {
  test("9. PWA instalável: manifest, ícones, service worker e metadados do iPhone", async ({ page, request }) => {
    const m = await request.get("/manifest.webmanifest");
    expect(m.status()).toBe(200);
    const manifest = await m.json();
    expect(manifest).toMatchObject({ name: "Ninguém Tá Puro", display: "standalone", start_url: "/dashboard" });
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable")).toBe(true);
    for (const i of manifest.icons) expect((await request.get(i.src)).headers()["content-type"]).toBe("image/png");
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    expect(sw.headers()["cache-control"]).toContain("no-cache");
    expect(await sw.text()).toContain('addEventListener("push"');
    await page.goto("/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", "/icons/apple-touch-icon.png");
    await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");
    // painel regista o service worker (sem cache) ao abrir
    await login(page);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration("/"))?.active?.scriptURL ?? null), { timeout: 15_000 }).toContain("/sw.js");
  });

  test("1/13. venda confirmada aparece na central (com contador) mesmo sem push", async ({ page }) => {
    await buy(page, "84 777 1001"); // termina em 1: confirmado pela consulta oficial
    await expect(page).toHaveURL(/\/oferta\/|\/obrigado\//, { timeout: 45_000 });
    await login(page);
    await expect(page.getByTestId("unread-badge").first()).toBeVisible();
    await page.goto("/notificacoes");
    const sale = page.getByTestId("notification").filter({ hasText: "👑 Venda aprovada!" }).first();
    await expect(sale).toBeVisible();
    // BARÃO: valor real em MT, sem o nome do produto
    await expect(sale).toContainText(/1\s?250,00 MT/);
    await expect(sale).not.toContainText("Ebook Moçambique");
    await expect(sale).toHaveAttribute("data-unread", "true");
    await expect(page.getByTestId("notification").filter({ hasText: "Pagamento pendente." }).first()).toBeVisible();
    // abrir leva ao pedido e marca como lida
    await sale.getByTestId("notification-open").click();
    await expect(page).toHaveURL(/\/pedidos\/[a-z0-9]+$/);
    await page.goto("/notificacoes?tipo=SALE_CONFIRMED");
    await expect(page.getByTestId("notification").first()).toHaveAttribute("data-unread", "false");
    await page.goto("/notificacoes");
    await page.getByTestId("mark-all-read").click();
    await toast(page, /marcada\(s\) como lida/);
    await expect(page.getByTestId("unread-badge")).toHaveCount(0);
    await page.goto("/notificacoes?tab=historico");
    await expect(page.getByTestId("event-history")).toContainText("Pago");
  });

  test("8/13. teste sem dispositivo subscrito fica na central e explica a situação", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes#notificacoes");
    await expect(page.getByTestId("push-settings")).toBeVisible();
    await page.getByRole("button", { name: "Testar só no painel" }).click();
    await expect(page.getByTestId("push-test-result")).toContainText("não foi enviada por push");
    await page.goto("/notificacoes");
    await expect(page.getByTestId("notification").filter({ hasText: "Notificação de teste" })).toBeVisible();
  });

  test("preferências: categorias ficam guardadas", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes#notificacoes");
    const daily = page.getByTestId("pref-dailySummary");
    await expect(daily).toHaveAttribute("aria-checked", "false");
    await daily.click();
    await toast(page, "Preferências guardadas.");
    await page.reload();
    await expect(page.getByTestId("pref-dailySummary")).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("pref-dailySummary").click();
    await toast(page, "Preferências guardadas.");
  });

  test("12. permissão recusada: explica como corrigir no Android", async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36", viewport: { width: 412, height: 900 } });
    await ctx.addInitScript(() => Object.defineProperty(Notification, "permission", { get: () => "denied" }));
    const page = await ctx.newPage();
    await login(page);
    await page.goto("/configuracoes#notificacoes");
    await expect(page.getByText("Notificações bloqueadas neste dispositivo")).toBeVisible();
    await expect(page.getByTestId("push-settings")).toContainText("Permissões");
    await ctx.close();
  });

  test("10/12. Android: autorização só depois do clique; recusa não regista o dispositivo", async ({ browser }) => {
    const ctx = await browser.newContext({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36" });
    await ctx.addInitScript(() => {
      (window as unknown as { __asked: number }).__asked = 0;
      Notification.requestPermission = async () => {
        (window as unknown as { __asked: number }).__asked++;
        return "denied";
      };
    });
    const page = await ctx.newPage();
    await login(page);
    await page.goto("/configuracoes#notificacoes");
    await expect(page.getByTestId("push-enable")).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked)).toBe(0); // nunca pede ao carregar
    await page.getByTestId("push-enable").click();
    await expect(page.getByRole("alert").filter({ hasText: /bloqueadas|não concedida/ }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __asked: number }).__asked)).toBe(1);
    await expect(page.getByTestId("push-device")).toHaveCount(0);
    await ctx.close();
  });

  test("11. iPhone no Safari sem instalar: instruções para adicionar ao ecrã principal", async ({ browser }) => {
    const ctx = await browser.newContext({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const page = await ctx.newPage();
    await login(page);
    await page.goto("/configuracoes#notificacoes");
    const box = page.getByTestId("ios-install");
    await expect(box).toBeVisible();
    for (const t of ["Safari", "Adicionar ao ecrã principal", "ecrã principal", "Ativar notificações", "Permitir"]) await expect(box).toContainText(t);
    await expect(page.getByTestId("push-enable")).toHaveCount(0);
    await noHorizontalScroll(page);
    await ctx.close();
  });

  test("4/14. relatórios: indicadores, aviso de lucro, filtros, período 'Ontem' e reembolso parcial", async ({ page }) => {
    await login(page);
    await page.goto("/relatorios?range=30d");
    await expect(page.getByTestId("finance-disclaimer")).toContainText("não é lucro nem saldo disponível");
    // pagamentos de teste não contam como faturamento real
    await expect(page.getByTestId("kpi-gross")).toHaveText(mzn("0,00"));
    await expect(page.getByTestId("kpi-pending")).not.toHaveText("0");
    await expect(page.getByTestId("tx-table")).toContainText("Fornecedor de teste");
    await page.getByTestId("tx-status").selectOption("PENDING");
    await page.getByTestId("tx-apply").click();
    await expect(page).toHaveURL(/estado=PENDING/);
    await expect(page.getByTestId("tx-table").getByText("Pago", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Ontem" }).click();
    await expect(page).toHaveURL(/range=yesterday/);
    await expect(page.getByText("Sem transações").first()).toBeVisible();

    // reembolso parcial de um pedido pago (registado depois de feito no gateway)
    await page.goto("/pedidos?status=APPROVED");
    await page.locator('a[href^="/pedidos/c"]').first().click();
    await page.getByTestId("refund-open").click();
    await page.getByTestId("refund-amount").fill("100,00");
    await expect(page.getByTestId("refund-submit")).toBeDisabled();
    await page.getByTestId("refund-confirm").check();
    await page.getByTestId("refund-submit").click();
    await toast(page, "Reembolso parcial registado.");
    await expect(page.getByTestId("refund-list")).toContainText(mzn("100,00"));
    await page.goto("/notificacoes?tipo=REFUND_CONFIRMED");
    await expect(page.getByTestId("notification").first()).toContainText("Reembolso confirmado.");
  });

  test("CSV: exportação com os filtros, sem fórmulas, só com sessão", async ({ page, request }) => {
    expect((await request.get("/relatorios/exportar?range=30d", { maxRedirects: 0 })).status()).not.toBe(200);
    await login(page);
    await page.goto("/relatorios?range=30d");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-csv").click()]);
    expect(dl.suggestedFilename()).toMatch(/^transacoes-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
    const text = (await (await dl.createReadStream()).toArray()).join("");
    expect(text.split("\r\n")[0]).toContain("Data;Confirmado em;Pedido;Produto;Valor;Moeda;Estado;Gateway;Referência da transação;Reembolso");
    expect(text).toContain("Fornecedor de teste");
    expect(text).toMatch(/;Parcial;100,00;/);
  });

  test("18. telemóvel: notificações, preferências e relatórios sem deslocamento horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);
    for (const url of ["/notificacoes", "/notificacoes?tab=historico", "/configuracoes", "/relatorios?range=30d"]) {
      await page.goto(url);
      await noHorizontalScroll(page);
    }
    // sino com contador no cabeçalho móvel
    await expect(page.getByRole("link", { name: /^Notificações/ }).first()).toBeVisible();
  });
});
