// Fluxo de pagamento real no navegador com o fornecedor de TESTE local (não é a EPay).
import { createHmac } from "crypto";
import { expect, test, type Page } from "@playwright/test";
import { login, mzn, toast } from "./helpers";

const SECRET = "segredo-e2e-apenas-testes";
let checkoutPath = "";

async function buy(page: Page, phone: string) {
  await page.goto(checkoutPath);
  await page.getByLabel("Nome completo").fill("Comprador Moçambique");
  await page.getByLabel("Email").fill("comprador@exemplo.co.mz");
  await page.getByLabel(/Número M-Pesa/).fill(phone);
  await page.getByRole("button", { name: "Pagar agora" }).click();
  await expect(page).toHaveURL(/\/pagamento\/[A-Za-z0-9_-]+$/);
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
    await page.getByLabel("Nome").fill("Ebook Moçambique");
    await page.getByLabel("Descrição").fill("Produto digital pago em meticais.");
    await page.getByLabel("Tipo").selectOption("EBOOK");
    await page.getByLabel("Preço", { exact: true }).fill("1.250,00");
    await page.getByLabel("Estado").selectOption("PUBLISHED");
    await page.getByLabel("URL de entrega/acesso").fill("https://conteudo.exemplo.co.mz/ebook");
    await page.getByRole("button", { name: "Criar produto" }).click();
    await toast(page, "Produto criado");
    await expect(page).toHaveURL(/\/produtos\/[a-z0-9]{20,}$/);
    const productUrl = page.url();
    await page.goto(`/checkouts/novo?productId=${productUrl.split("/").pop()}`);
    await page.getByLabel("Texto do botão").fill("Pagar agora");
    await page.getByRole("button", { name: "Criar checkout" }).click();
    await toast(page, "Checkout criado");
    checkoutPath = (await page.getByTestId("checkout-path").textContent())!.trim();
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

    await page.goto(statusUrl);
    await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "paid");
    await page.getByTestId("access-link").click();
    await expect(page.getByRole("heading", { name: "Os seus produtos" })).toBeVisible();
    await expect(page.getByTestId("delivery-link")).toHaveAttribute("href", "https://conteudo.exemplo.co.mz/ebook");

    // sessão de administrador já iniciada em externalIdFor
    await page.goto(`/pedidos?q=${code}`);
    await page.getByRole("link", { name: code }).first().click();
    await expect(page.getByText("Pago").first()).toBeVisible();
    await expect(page.getByTestId("audit-log").locator("li")).toHaveCount(2); // criada → paga, uma única vez
    await expect(page.getByText(mzn("1 212,50")).first()).toBeVisible(); // líquido = 1250 − 37,50 de taxa devolvida
  });

  test("a página de estado atualiza sozinha quando a consulta oficial confirma", async ({ page }) => {
    await buy(page, "84 111 2221"); // termina em 1 → consulta de estado devolve pago
    await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "paid", { timeout: 30_000 });
    await expect(page.getByTestId("access-link")).toBeVisible();
  });

  test("pagamento recusado mostra falha e opção de tentar novamente", async ({ page }) => {
    await buy(page, "84 111 2220"); // termina em 0 → recusa imediata
    await expect(page.getByTestId("payment-state")).toHaveAttribute("data-state", "failed");
    await expect(page.getByRole("link", { name: "Tentar novamente" })).toBeVisible();
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

  test("dashboard conta só pagamentos confirmados, em MZN", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard?range=today");
    // duas encomendas pagas de 1 250,00 (webhook + consulta) = 2 500,00
    await expect(page.getByText(mzn("2 500,00")).first()).toBeVisible();
  });
});
