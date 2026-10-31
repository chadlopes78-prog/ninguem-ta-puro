// Fluxo de pagamento real no navegador com o fornecedor de TESTE local (não é a EPay).
import { createHmac } from "crypto";
import { expect, test, type Page } from "@playwright/test";
import { completeAndPublish, login, mzn, toast, toPaymentPage, PAY_BUTTON } from "./helpers";

const SECRET = "segredo-e2e-apenas-testes";
let checkoutPath = "";

async function buy(page: Page, phone: string) {
  await page.goto(checkoutPath);
  await page.getByLabel("Nome completo").fill("Comprador Moçambique");
  await page.getByLabel("Email").fill("comprador@exemplo.co.mz");
  await page.getByLabel(/Número M-Pesa/).fill(phone);
  await page.getByRole("button", { name: PAY_BUTTON }).click();
  // o comprador fica no checkout com a janela de confirmação no telemóvel
  await expect(page.getByTestId("payment-waiting")).toBeVisible();
  // enquanto aguarda o PIN não há «Ver estado do pedido» (segue sozinha quando o pagamento é confirmado)
  await expect(page.getByText("Ver estado do pedido")).toHaveCount(0);
  // pendente: página de estado; já confirmado (consulta oficial): a janela segue sozinha para o obrigado
  await toPaymentPage(page);
  return page.url();
}

async function externalIdFor(page: Page, statusUrl: string) {
  const code = (await page.goto(statusUrl).then(() => page.locator("p", { hasText: "Encomenda" }).locator("span.font-mono").first().textContent()))!.trim();
  await login(page);
  await page.goto(`/pedidos?q=${code}`);
  await page.getByRole("link", { name: code }).first().click();
  const ext = (await page.getByTestId("payments-list").locator("p.font-mono").first().textContent())!.trim();
  return { code, ext };
}

test.describe.serial("pagamentos (fornecedor de teste local)", () => {
  test("preparar produto MZN e checkout", async ({ page }) => {
    await login(page);
    await page.goto("/produtos/novo");
    await page.getByLabel("Nome do produto").fill("Ebook Moçambique");
    await page.getByLabel("Descrição").fill("Produto digital pago em meticais.");
    await page.getByLabel("Preço principal").fill("1.250,00");
    await page.getByRole("button", { name: "Guardar rascunho" }).click();
    await toast(page, "Produto guardado como rascunho");
    await expect(page).toHaveURL(/\/produtos\/[a-z0-9]{20,}\?criado=1$/);
    checkoutPath = new URL((await page.getByTestId("product-checkout-url").textContent())!.trim()).pathname;
    expect(checkoutPath).toBe("/checkout/ebook-mocambique");
    // o texto do botão é personalizável no editor (Estilo do checkout) e só muda o checkout após publicar
    await page.getByTestId("checkout-link-card").getByRole("link", { name: "Personalizar checkout" }).click();
    await page.getByRole("button", { name: "Estilo do checkout" }).click();
    await page.getByLabel("Texto do botão de compra").fill("Pagar agora");
    await page.getByTestId("publish").click();
    await toast(page, /publicad/i);
    // configuração obrigatória (funil, página de obrigado, WhatsApp e entrega) e publicação pelo fluxo real
    await completeAndPublish(page, "Ebook Moçambique", { deliveryUrl: "https://conteudo.exemplo.co.mz/ebook" });
  });

  test("checkout mostra MZN e métodos; pagamento fica pendente; visitar a página não marca como pago", async ({ page }) => {
    await page.goto(checkoutPath);
    await expect(page.getByText(mzn("1 250,00")).first()).toBeVisible();
    await expect(page.getByRole("radio", { name: "M-Pesa (teste)" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "e-Mola (teste)" })).toBeVisible();
    const statusUrl = await buy(page, "84 123 4567");
    await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "pending");
    await expect(page.getByText("Pedido enviado para 84•••••67")).toBeVisible();
    await expect(page.getByTestId("access-link")).toHaveCount(0);
    for (let i = 0; i < 2; i++) {
      await page.goto(statusUrl);
      await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "pending");
    }
  });

  test("notificação assinada confirma o pagamento; repetição não duplica; acesso só depois", async ({ page, request }) => {
    const statusUrl = await buy(page, "84 765 4323");
    const { code, ext } = await externalIdFor(page, statusUrl);
    const body = JSON.stringify({ eventId: `evt-${code}`, externalId: ext, status: "paid", amountCents: 125000, currency: "MZN", feeCents: 3750 });
    const sig = createHmac("sha256", SECRET).update(body).digest("hex");

    const bad = await request.post("/api/webhooks/teste-local", { data: body, headers: { "content-type": "application/json", "x-test-signature": "0".repeat(64) } });
    expect(bad.status()).toBe(401);

    const ok = await request.post("/api/webhooks/teste-local", { data: body, headers: { "content-type": "application/json", "x-test-signature": sig } });
    expect(ok.status()).toBe(200);
    const dup = await request.post("/api/webhooks/teste-local", { data: body, headers: { "content-type": "application/json", "x-test-signature": sig } });
    expect(dup.status()).toBe(200);

    // confirmado: a página de estado encaminha para a página de obrigado do funil do produto
    await page.goto(statusUrl);
    await expect(page).toHaveURL(/\/obrigado\//);
    await expect(page.getByTestId("thank-you")).toHaveAttribute("data-state", "confirmed");
    await expect(page.getByTestId("thank-you-whatsapp")).toHaveAttribute("href", "https://wa.me/258841234567");
    await expect(page.getByTestId("thank-you-button")).toHaveAttribute("href", "https://conteudo.exemplo.co.mz/ebook");

    // sessão de administrador já iniciada em externalIdFor
    await page.goto(`/pedidos?q=${code}`);
    await page.getByRole("link", { name: code }).first().click();
    await expect(page.getByText("Pago").first()).toBeVisible();
    await expect(page.getByTestId("audit-log").locator("li")).toHaveCount(2); // criada → paga, uma única vez
    await expect(page.getByText(mzn("1 212,50")).first()).toBeVisible(); // líquido = 1250 − 37,50 de taxa devolvida
  });

  test("a página de estado atualiza sozinha quando a consulta oficial confirma", async ({ page }) => {
    await buy(page, "84 111 2221"); // termina em 1 → consulta de estado devolve pago
    await expect(page).toHaveURL(/\/obrigado\//, { timeout: 30_000 });
    await expect(page.getByTestId("thank-you")).toHaveAttribute("data-state", "confirmed");
    await expect(page.getByTestId("thank-you-button")).toBeVisible();
  });

  test("pagamento recusado logo pelo gateway: erro real no checkout, sem pedir o PIN", async ({ page }) => {
    await page.goto(checkoutPath);
    await page.getByLabel("Nome completo").fill("Comprador Moçambique");
    await page.getByLabel("Email").fill("comprador@exemplo.co.mz");
    await page.getByLabel(/Número M-Pesa/).fill("84 111 2220"); // termina em 0 → recusa imediata
    await page.getByRole("button", { name: PAY_BUTTON }).click();
    // a mensagem real (recusado pelo operador), nunca «Confirme no seu telemóvel»
    await expect(page.getByText(/Pagamento recusado pelo operador.*Nenhum valor foi cobrado/)).toBeVisible();
    await expect(page.getByTestId("payment-waiting")).toHaveCount(0);
    // pode tentar de novo no mesmo checkout
    await expect(page.getByRole("button", { name: PAY_BUTTON })).toBeEnabled();
  });

  test("pagamento expirado é apresentado como cancelado", async ({ page }) => {
    await buy(page, "84 111 2222"); // termina em 2 → consulta de estado devolve expirado
    await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "canceled", { timeout: 30_000 });
  });

  test("erro de comunicação mantém pendente com aviso, sem confirmar", async ({ page }) => {
    await buy(page, "84 111 2229"); // termina em 9 → erro de rede simulado
    await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "pending");
    await expect(page.getByText("Não foi possível confirmar o estado")).toBeVisible();
  });

  test("acesso com token inválido e encomenda inexistente não revelam informação", async ({ page }) => {
    await page.goto("/acesso/token-que-nao-existe-com-tamanho-ok-1234");
    await expect(page.getByRole("heading", { name: "Acesso indisponível" })).toBeVisible();
    await page.goto("/pagamento/token-que-nao-existe-123456");
    await expect(page.getByRole("heading", { name: "Encomenda não encontrada" })).toBeVisible();
  });

  test("pagamentos feitos com credenciais de teste não contam como receita", async ({ page }) => {
    await login(page);
    await page.goto("/pedidos?status=APPROVED");
    await expect(page.getByText("Pagamento de teste").first()).toBeVisible();
    await page.goto("/dashboard?range=today");
    // há encomendas pagas no ambiente de teste, mas a faturação real continua a zero
    const grossCard = page.getByText("Faturação bruta").first().locator("xpath=ancestor::div[contains(@class,'rounded-')][1]");
    await expect(grossCard).toContainText(mzn("0,00"));
    await expect(page.getByText(mzn("2 500,00"))).toHaveCount(0);
  });
});
