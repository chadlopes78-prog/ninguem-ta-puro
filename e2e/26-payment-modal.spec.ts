// Janela «Confirme o pagamento no seu telemóvel»: só depois de o gateway aceitar o pedido, centrada no ecrã (nunca
// colada ao fundo do checkout) em vários telemóveis, dentro das margens e por cima do botão fixo de pagamento.
// Pagamentos só pelo fornecedor de TESTE local (número terminado em 3 = fica pendente).
import { expect, test, type Page } from "@playwright/test";
import { PAY_BUTTON } from "./helpers";

const DEVICES = [
  { name: "iPhone 14 Pro (Dynamic Island)", width: 393, height: 852 },
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "Samsung Galaxy S20", width: 360, height: 800 },
  { name: "Redmi / Tecno / Infinix", width: 393, height: 873 },
  { name: "ecrã pequeno", width: 320, height: 568 },
];

let buyer = 0;
async function startPayment(page: Page, phone: string) {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": `10.26.0.${++buyer}` });
  await page.goto("/checkout/ebook-mocambique");
  await page.getByLabel("Nome completo").fill("Comprador Modal");
  await page.getByLabel("Email").fill("modal@exemplo.co.mz");
  await page.getByLabel(/Número M-Pesa/).fill(phone);
  await page.getByRole("button", { name: PAY_BUTTON }).first().click();
}

test.describe("janela de confirmação do pagamento", () => {
  for (const d of DEVICES) {
    test(`centrada e completa no ecrã — ${d.name} (${d.width}×${d.height})`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: d.width, height: d.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await ctx.newPage();
      await startPayment(page, `84 333 ${String(1000 + buyer).slice(-3)}3`);
      const dialog = page.getByTestId("payment-waiting");
      await expect(dialog).toHaveAttribute("data-state", "pending");
      await expect(page.getByRole("heading", { name: "Confirme o pagamento no seu telemóvel." })).toBeVisible();
      await expect(page.getByText("Introduza o seu PIN no pedido recebido para concluir a compra.")).toBeVisible();
      await expect(page.getByTestId("payment-spinner")).toBeVisible();
      // a janela é filha do <body> (não do checkout) e cobre o ecrã inteiro
      expect(await dialog.evaluate((el) => el.parentElement === document.body)).toBe(true);
      const card = (await page.getByTestId("payment-dialog-card").boundingBox())!;
      // dentro do ecrã, com margens laterais
      expect(card.x).toBeGreaterThanOrEqual(12);
      expect(card.x + card.width).toBeLessThanOrEqual(d.width - 12);
      expect(card.y).toBeGreaterThanOrEqual(12);
      expect(card.y + card.height).toBeLessThanOrEqual(d.height - 12);
      // centrada nos dois eixos (tolerância de 2 px)
      expect(Math.abs(card.x + card.width / 2 - d.width / 2)).toBeLessThanOrEqual(2);
      expect(Math.abs(card.y + card.height / 2 - d.height / 2)).toBeLessThanOrEqual(2);
      // fundo branco e por cima do botão fixo de pagamento
      expect(await page.getByTestId("payment-dialog-card").evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 255, 255)");
      const topEl = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest("[data-testid=payment-waiting]") !== null, [d.width / 2, d.height - 20]);
      expect(topEl).toBe(true);
      // sem deslocamento horizontal
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await ctx.close();
    });
  }

  test("o gateway recusa logo: erro real, sem janela «Confirme»; erro de comunicação: «A confirmar o pagamento…»", async ({ page }) => {
    await startPayment(page, "84 222 3330"); // termina em 0 → recusa imediata
    await expect(page.getByText(/A operadora recusou o pagamento.*Nenhum valor foi cobrado/)).toBeVisible();
    await expect(page.getByTestId("payment-waiting")).toHaveCount(0);

    await startPayment(page, "84 222 3339"); // termina em 9 → sem resposta conclusiva do gateway
    await expect(page.getByTestId("payment-waiting")).toHaveAttribute("data-state", "checking");
    await expect(page.getByRole("heading", { name: "A confirmar o pagamento…" })).toBeVisible();
  });

  test("pagamento expirado na consulta: título e motivo próprios; «Usar outro número» mantém os dados e permite nova tentativa", async ({ page }) => {
    await startPayment(page, "84 555 6662"); // termina em 2 → a consulta oficial devolve expirado
    const dialog = page.getByTestId("payment-waiting");
    await expect(dialog).toHaveAttribute("data-state", "failed", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Pagamento expirado" })).toBeVisible();
    await expect(dialog).toContainText("O tempo para confirmar o pagamento expirou. Inicie uma nova tentativa.");
    await expect(dialog).toContainText("Nenhum valor foi cobrado");
    await expect(page.getByTestId("payment-retry")).toBeVisible();
    await page.getByTestId("payment-change-phone").click();
    await expect(dialog).toHaveCount(0);
    // os dados continuam preenchidos e o número fica em foco para corrigir
    await expect(page.getByLabel("Nome completo")).toHaveValue("Comprador Modal");
    await expect(page.getByLabel(/Número M-Pesa/)).toBeFocused();
    await page.getByLabel(/Número M-Pesa/).fill("84 555 6663");
    await page.getByRole("button", { name: PAY_BUTTON }).first().click();
    // nova tentativa: novo pedido, a janela volta a pedir o PIN
    await expect(page.getByTestId("payment-waiting")).toHaveAttribute("data-state", "pending");
  });

  test("credenciais de teste: a janela avisa que nenhum pedido real chega ao telemóvel; um único pedido por clique", async ({ page }) => {
    let submits = 0;
    page.on("request", (r) => {
      // só a submissão da compra (server action), não o registo da visita
      if (r.method() === "POST" && r.headers()["next-action"]) submits++;
    });
    await startPayment(page, "84 444 5553");
    await expect(page.getByTestId("payment-test-mode")).toContainText("Modo de teste");
    // a janela cobre o formulário: novos cliques não chegam ao botão
    await page.mouse.click(10, 10);
    expect(submits).toBe(1);
  });
});
