// Editor visual do checkout (tipo Elementor): checkout padrão, remoções pedidas, arrastar e soltar,
// imagens, estilos, rascunho/publicação, telemóvel, compra de teste e isolamento.
// Compras só com o fornecedor de TESTE local (nenhum pagamento real).
import { expect, test, type Locator, type Page } from "@playwright/test";
import { completeAndPublish, login, mzn, noHorizontalScroll, toast } from "./helpers";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
let publicPath = "";
let editorUrl = "";

/** Erros na consola/página durante cada teste (ponto 18). */
const problems: string[] = [];
test.beforeEach(({ page }) => {
  problems.length = 0;
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon/i.test(m.text())) problems.push(`console: ${m.text()}`);
  });
});
test.afterEach(() => expect(problems, problems.join("\n")).toEqual([]));

/** Arrastar com o rato (como uma pessoa): "top"/"bottom" = metade do alvo onde se larga. */
async function drag(page: Page, from: Locator, to: Locator, where: "top" | "bottom") {
  const a = (await from.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + Math.min(a.height / 2, 20));
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 12, a.y + Math.min(a.height / 2, 20) + 12, { steps: 4 });
  const t = (await to.boundingBox())!;
  const y = where === "top" ? t.y + Math.min(8, t.height / 4) : t.y + t.height - Math.min(8, t.height / 4);
  await page.mouse.move(t.x + t.width / 2, y, { steps: 14 });
  // linha que mostra onde o elemento vai ficar, antes de largar
  await expect(page.getByTestId("drop-indicator").first()).toBeVisible();
  await page.mouse.up();
  await expect(page.getByTestId("drop-indicator")).toHaveCount(0);
}

const canvas = (page: Page) => page.getByTestId("editor-canvas");
const elementTypes = (page: Page, sectionId: string) => canvas(page).locator(`[data-editor-section="${sectionId}"] [data-testid=canvas-element]`).evaluateAll((els) => els.map((e) => e.getAttribute("data-type")));
const el = (page: Page, id: string) => canvas(page).locator(`[data-editor-element="${id}"]`);

test.describe.serial("editor visual do checkout", () => {
  test("1–2. checkout padrão simples com dados reais: nome, preço e total uma só vez; sem 'Compra segura', cabeçalho nem rodapé", async ({ page }) => {
    await login(page);
    await page.goto("/produtos/novo");
    await page.getByLabel("Nome").fill("Curso Editor Visual");
    await page.getByLabel("Descrição").fill("Aprenda a montar páginas de venda que convertem, passo a passo.");
    await page.getByLabel("Tipo").selectOption("COURSE");
    await page.getByLabel("Preço", { exact: true }).fill("500,00");
    await page.getByRole("button", { name: "Criar produto" }).click();
    await toast(page, "Produto criado");
    publicPath = new URL((await page.getByTestId("product-checkout-url").textContent())!.trim()).pathname;
    const productUrl = page.url();
    await completeAndPublish(page, "Curso Editor Visual", { deliveryUrl: "https://conteudo.exemplo.co.mz/curso" });
    await page.goto(productUrl);
    await page.getByTestId("checkout-link-card").getByRole("link", { name: "Personalizar checkout" }).click();
    await expect(page.getByTestId("checkout-editor")).toBeVisible();
    editorUrl = new URL(page.url()).pathname;

    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await page.goto(publicPath);
      const h1 = page.getByRole("heading", { level: 1, name: "Curso Editor Visual" });
      await expect(h1).toBeVisible();
      await expect(page.getByTestId("price")).toContainText(mzn("500,00"));
      await expect(page.getByTestId("purchase-form")).toBeVisible();
      // o total aparece uma única vez, junto ao botão, e corresponde ao preço real
      await expect(page.getByTestId("order-summary")).toHaveCount(1);
      await expect(page.getByTestId("order-total")).toHaveText(mzn("500,00"));
      const btn = page.getByRole("button", { name: "Finalizar compra" });
      await expect(btn).toBeVisible();
      // ordem: nome → preço → formulário (dados → pagamento → total → botão)
      const y = async (l: Locator) => (await l.boundingBox())!.y;
      expect(await y(h1)).toBeLessThan(await y(page.getByTestId("price")));
      expect(await y(page.getByTestId("price"))).toBeLessThan(await y(page.getByLabel("Nome completo")));
      expect(await y(page.getByLabel("Nome completo"))).toBeLessThan(await y(page.getByTestId("payment-options")));
      expect(await y(page.getByTestId("payment-options"))).toBeLessThan(await y(page.getByTestId("order-total")));
      expect(await y(page.getByTestId("order-total"))).toBeLessThan(await y(btn));
      const body = await page.locator("body").innerText();
      // sem repetições do produto/preço nem a descrição longa no modelo simples
      expect(body).not.toContain("Preço principal");
      expect(body.match(/500,00/g)?.length).toBe(2); // preço no topo + total junto ao botão
      expect(body).not.toContain("Aprenda a montar páginas de venda");
      expect(body).not.toContain("Compra segura");
      expect(body).not.toContain("Ligação cifrada");
      expect(body).not.toMatch(/©/);
      expect(body).not.toContain("Suporte:");
      await expect(page.locator("header")).toHaveCount(0);
      await expect(page.locator("footer")).toHaveCount(0);
      await noHorizontalScroll(page);
    }
  });

  test("3–7. editor simples: arrastar imagem, carregar ficheiro, mover, cronómetro com cor e estilos do título", async ({ page }) => {
    await login(page);
    await page.goto(editorUrl);
    await expect(canvas(page)).toHaveAttribute("data-device", "desktop");
    expect(await elementTypes(page, "hero")).toEqual(["heading", "image", "price", "checkout"]);
    // painel de elementos simples (9) + componentes protegidos
    await expect(page.getByTestId("element-library").locator("[data-testid^=lib-]:not([data-testid=lib-protected])")).toHaveCount(9);
    for (const t of ["heading", "text", "image", "banner", "countdown", "benefits", "testimonials", "guarantee", "spacer"]) await expect(page.getByTestId(`lib-${t}`)).toBeVisible();
    await expect(page.getByTestId("lib-video")).toHaveCount(0);
    await expect(page.getByTestId("lib-protected")).toHaveCount(3);

    // 3–4. arrastar "Imagem" da biblioteca para cima do título
    await drag(page, page.getByTestId("lib-image"), el(page, "product-name"), "top");
    expect(await elementTypes(page, "hero")).toEqual(["image", "heading", "image", "price", "checkout"]);
    const newImage = canvas(page).locator("[data-testid=canvas-element][data-type=image]").first();
    const imageId = (await newImage.getAttribute("data-editor-element"))!;
    // carregar uma imagem (validada no servidor) e texto alternativo
    await page.getByTestId("choose-image").click();
    await page.getByTestId("media-file").setInputFiles({ name: "capa.png", mimeType: "image/png", buffer: PNG });
    await toast(page, "Imagem carregada");
    await expect(el(page, imageId).locator("img")).toHaveAttribute("src", /^\/api\/public\/media\/[a-z0-9]+$/);
    await page.getByLabel("Texto alternativo (acessibilidade)").fill("Capa do curso");
    await page.getByLabel("Proporção").selectOption("3/1");
    await expect(el(page, imageId).locator("img")).toHaveCSS("aspect-ratio", "3 / 1");
    // só opções relevantes para uma imagem (sem tipografia nem opções técnicas)
    await expect(page.getByTestId("element-properties").getByLabel("Tamanho do texto")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Avançado" })).toHaveCount(0);

    // 5. mover a imagem para baixo do título
    await drag(page, el(page, imageId), el(page, "product-name"), "bottom");
    expect(await elementTypes(page, "hero")).toEqual(["heading", "image", "image", "price", "checkout"]);
    await expect(canvas(page).locator("[data-testid=canvas-element]").nth(1)).toHaveAttribute("data-editor-element", imageId);

    // 6. cronómetro arrastado para cima do formulário (abaixo do preço); a cor escolhida preenche TODO o componente, texto branco
    await drag(page, page.getByTestId("lib-countdown"), el(page, "checkout"), "top");
    expect(await elementTypes(page, "hero")).toEqual(["heading", "image", "image", "price", "countdown", "checkout"]);
    await page.getByLabel("Cor do fundo", { exact: true }).fill("#DC2626");
    const cd = canvas(page).getByTestId("countdown");
    await expect(cd).toHaveCSS("background-color", "rgb(220, 38, 38)");
    await expect(cd).toHaveCSS("color", "rgb(255, 255, 255)");
    // áreas internas (números/unidades) também coloridas, nunca brancas/transparentes
    for (const bg of await cd.getByTestId("countdown-unit").evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor))) {
      expect(bg).not.toMatch(/rgba?\(255, 255, 255|rgba\(0, 0, 0, 0\)|transparent/);
    }
    await page.getByRole("radio", { name: "Grande" }).click();
    // o produto e o pagamento estão protegidos: sem botão de eliminar
    await el(page, "checkout").click();
    await expect(page.getByTestId("el-delete")).toHaveCount(0);
    await expect(page.getByTestId("protected-note")).toBeVisible();
    await el(page, "product-price").click();
    await expect(page.getByTestId("el-delete")).toHaveCount(0);
    await page.keyboard.press("Delete");
    await expect(el(page, "product-price")).toHaveCount(1);

    // 7. tamanho e cor do título (com desfazer/refazer) — opções do título: texto, tamanho, cor, alinhamento
    await el(page, "product-name").click();
    await page.getByLabel("Tamanho do texto", { exact: true }).fill("44");
    await page.getByLabel("Cor do texto", { exact: true }).fill("#FF5500");
    const h1 = el(page, "product-name").locator("h1");
    await expect(h1).toHaveCSS("font-size", "44px");
    await expect(h1).toHaveCSS("color", "rgb(255, 85, 0)");
    await page.getByTestId("undo").click();
    await expect(h1).not.toHaveCSS("color", "rgb(255, 85, 0)");
    await page.getByTestId("redo").click();
    await expect(h1).toHaveCSS("color", "rgb(255, 85, 0)");
    await expect(page.getByTestId("save-status")).toHaveText("Alterações por guardar");

    // 8. guardar o rascunho
    await page.getByTestId("save-draft").click();
    await toast(page, "Rascunho guardado");
    await expect(page.getByTestId("save-status")).toContainText("Guardado às");

    // 9. reabrir: tudo persiste (vem da base de dados)
    await page.reload();
    expect(await elementTypes(page, "hero")).toEqual(["heading", "image", "image", "price", "countdown", "checkout"]);
    await expect(el(page, imageId).locator("img")).toHaveAttribute("alt", "Capa do curso");
    await expect(el(page, "product-name").locator("h1")).toHaveCSS("font-size", "44px");
    await expect(canvas(page).getByTestId("countdown")).toHaveCSS("background-color", "rgb(220, 38, 38)");

    // o rascunho não altera o checkout público
    await page.goto(publicPath);
    await expect(page.getByRole("img", { name: "Capa do curso" })).toHaveCount(0);
  });

  test("estilo do checkout: cores dos botões e dos textos; restaurar estilo padrão mantém o conteúdo", async ({ page }) => {
    await login(page);
    await page.goto(editorUrl);
    await page.getByTestId("checkout-style").click();
    await page.getByLabel("Cor dos botões", { exact: true }).fill("#2563EB");
    const submit = canvas(page).getByRole("button", { name: "Finalizar compra" });
    await expect(submit).toHaveCSS("background-color", "rgb(37, 99, 235)");
    await expect(submit).toHaveCSS("color", "rgb(255, 255, 255)");
    await page.getByLabel("Cor do cronómetro", { exact: true }).fill("#16A34A");
    // o cronómetro tem cor própria (vermelho): a do tema só se aplica aos que não têm
    await expect(canvas(page).getByTestId("countdown")).toHaveCSS("background-color", "rgb(220, 38, 38)");
    await page.getByTestId("restore-style").click();
    await expect(submit).not.toHaveCSS("background-color", "rgb(37, 99, 235)");
    await expect(el(page, "product-name").locator("h1")).not.toHaveCSS("font-size", "44px");
    await expect(canvas(page).getByTestId("countdown")).not.toHaveCSS("background-color", "rgb(220, 38, 38)");
    expect(await elementTypes(page, "hero")).toEqual(["heading", "image", "image", "price", "countdown", "checkout"]);
    // desfazer o restauro (o teste seguinte publica a versão personalizada)
    await page.getByTestId("undo").click();
    await page.getByTestId("undo").click();
    await page.getByTestId("undo").click();
    await expect(el(page, "product-name").locator("h1")).toHaveCSS("font-size", "44px");
    await expect(submit).not.toHaveCSS("background-color", "rgb(37, 99, 235)");
    await expect(page.getByTestId("save-status")).not.toHaveText("Alterações por guardar");
  });

  test("10–12. publicar: o checkout público mostra a versão publicada, em computador e telemóvel", async ({ page }) => {
    await login(page);
    await page.goto(editorUrl);
    await page.getByTestId("publish").click();
    await toast(page, "Personalização publicada");

    await page.goto(publicPath);
    const img = page.getByRole("img", { name: "Capa do curso" });
    await expect(img).toBeVisible();
    expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    const h1 = page.getByRole("heading", { level: 1, name: "Curso Editor Visual" });
    await expect(h1).toHaveCSS("font-size", "44px");
    await expect(h1).toHaveCSS("color", "rgb(255, 85, 0)");
    // ordem publicada: título → imagem → preço → cronómetro → formulário
    const y = async (l: Locator) => (await l.boundingBox())!.y;
    expect(await y(h1)).toBeLessThan(await y(img));
    expect(await y(img)).toBeLessThan(await y(page.getByTestId("price")));
    const cd = page.getByTestId("countdown");
    expect(await y(page.getByTestId("price"))).toBeLessThan(await y(cd));
    expect(await y(cd)).toBeLessThan(await y(page.getByTestId("purchase-form")));
    // contagem decrescente real: o segundo muda
    const secs = cd.getByTestId("countdown-unit").last().locator("span").first();
    const before = await secs.textContent();
    await expect(secs).not.toHaveText(before!, { timeout: 3000 });
    await expect(cd).toHaveCSS("background-color", "rgb(220, 38, 38)");
    await expect(page.getByText(mzn("500,00")).first()).toBeVisible(); // preço da BD, inalterado
    await noHorizontalScroll(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.reload();
    await expect(h1).toHaveCSS("font-size", "35px"); // tamanho reduzido automaticamente no telemóvel
    await expect(page.getByLabel("Nome completo")).toBeVisible();
    await expect(page.getByRole("button", { name: "Finalizar compra" })).toBeVisible();
    // cronómetro no telemóvel: fundo completo, dentro da largura do ecrã, números inteiros visíveis
    const box = (await cd.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    await expect(cd).toHaveCSS("background-color", "rgb(220, 38, 38)");
    for (const u of await cd.getByTestId("countdown-unit").all()) {
      const ub = (await u.boundingBox())!;
      expect(ub.x + ub.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(await u.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true);
    }
    // botão fácil de tocar
    expect((await page.getByRole("button", { name: "Finalizar compra" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await noHorizontalScroll(page);

    // editor também utilizável no telemóvel (sessão já iniciada)
    await page.goto(editorUrl);
    await expect(canvas(page)).toHaveAttribute("data-device", "mobile");
    await noHorizontalScroll(page);
    await el(page, "product-name").click();
    await page.getByRole("button", { name: "Editar propriedades" }).click();
    await expect(page.getByTestId("element-properties")).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("13–16. compra de teste no checkout personalizado; confirmação oficial; redirecionamento para o acesso", async ({ page }) => {
    await page.goto(publicPath);
    await page.getByLabel("Nome completo").fill("Comprador Editor");
    await page.getByLabel("Email").fill("comprador.editor@exemplo.co.mz");
    await page.getByRole("radio", { name: "M-Pesa (teste)" }).check();
    await page.getByLabel(/Número M-Pesa/).fill("84 111 2221"); // termina em 1 → a consulta oficial confirma
    await page.getByRole("button", { name: "Finalizar compra" }).click();
    await expect(page).toHaveURL(/\/pagamento\/[A-Za-z0-9_-]+$/);
    // confirmado pela consulta oficial → página de obrigado do funil: WhatsApp acima do acesso ao produto
    await expect(page).toHaveURL(/\/obrigado\//, { timeout: 30_000 });
    await expect(page.getByTestId("thank-you")).toHaveAttribute("data-state", "confirmed");
    const wa = page.getByTestId("thank-you-whatsapp");
    const access = page.getByTestId("thank-you-button");
    await expect(wa).toHaveAttribute("href", "https://wa.me/258841234567");
    await expect(access).toHaveAttribute("href", "https://conteudo.exemplo.co.mz/curso");
    expect((await wa.boundingBox())!.y).toBeLessThan((await access.boundingBox())!.y);
  });

  test("17. o editor e a biblioteca não dão acesso a checkouts ou imagens de outras contas", async ({ page, browser }) => {
    await login(page);
    expect((await page.goto("/checkouts/personalizar/cl0000000000000000000000x"))?.status()).toBe(404);
    expect((await page.request.delete("/api/media/cl0000000000000000000000x")).status()).toBe(404);
    expect((await page.request.post("/api/media", { headers: { origin: "https://site-malicioso.exemplo" }, multipart: { file: { name: "a.png", mimeType: "image/png", buffer: PNG } } })).status()).toBe(403);
    expect((await page.request.post("/api/media", { multipart: { file: { name: "a.svg", mimeType: "image/svg+xml", buffer: Buffer.from("<svg><script>alert(1)</script></svg>") } } })).status()).toBe(400);
    const anon = await browser.newContext();
    expect((await anon.request.get("/api/media")).status()).toBe(401);
    await anon.close();
  });

  test("sair com alterações por guardar pede confirmação; cancelar repõe a última versão guardada", async ({ page }) => {
    await login(page);
    await page.goto(editorUrl);
    await page.getByTestId("lib-spacer").click();
    await expect(page.getByTestId("save-status")).toHaveText("Alterações por guardar");
    await page.getByRole("link", { name: "Voltar a Personalizar Checkout" }).click();
    await expect(page.getByRole("dialog")).toContainText("Sair sem guardar?");
    await page.getByRole("dialog").getByRole("button", { name: "Voltar" }).click();
    await expect(page).toHaveURL(new RegExp(editorUrl));
    await page.getByTestId("cancel-changes").click();
    await page.getByTestId("confirm-action").click();
    await expect(canvas(page).locator("[data-type=spacer]")).toHaveCount(0);
    await expect(page.getByTestId("save-status")).not.toHaveText("Alterações por guardar");
  });
});
