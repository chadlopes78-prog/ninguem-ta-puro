import { expect, test } from "@playwright/test";
import { login, toast } from "./helpers";

test.describe.serial("modo de demonstração (secção 28)", () => {
  test("ativar demo e gerar dados identificados", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
    await page.getByRole("button", { name: "Gerar dados de demonstração" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await toast(page, "Dados de demonstração gerados");
    await page.goto("/dashboard");
    await expect(page.getByText("Modo de demonstração", { exact: false }).first()).toBeVisible();
    await expect(page.getByText("Dados de demonstração").first()).toBeVisible();
    await expect(page.getByText("R$ 12.450,00").first()).toBeVisible();
    await expect(page.getByText("R$ 296,43").first()).toBeVisible();
  });

  test("filtros do dashboard atualizam os dados", async ({ page }) => {
    await login(page);
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Hoje" }).click();
    await expect(page).toHaveURL(/range=today/);
    await expect(page.getByText("R$ 12.450,00")).toHaveCount(0);
    await page.getByRole("button", { name: "Últimos 30 dias" }).click();
    await expect(page.getByText("R$ 12.450,00").first()).toBeVisible();
  });

  test("dados demo não se misturam com reais", async ({ page }) => {
    await login(page);
    await page.goto("/produtos");
    await expect(page.getByText("Guia Digital de Exemplo").first()).toBeVisible();
    await expect(page.getByText("Guia Digital Editado")).toHaveCount(0);
    await page.goto("/pedidos");
    await expect(page.getByText("Teste manual")).toHaveCount(0);
  });

  test("pedidos: filtros por estado e detalhe", async ({ page }) => {
    await login(page);
    await page.goto("/pedidos");
    await page.getByLabel("Estado").selectOption("PENDING");
    await expect(page.getByText("3 resultado(s)")).toBeVisible();
    await page.getByLabel("Estado").selectOption("REFUNDED");
    await expect(page.getByText("1 resultado(s)")).toBeVisible();
    await page.getByLabel("Estado").selectOption("DECLINED");
    await expect(page.getByText("1 resultado(s)")).toBeVisible();
    await page.getByRole("link", { name: /^NTP-/ }).first().click();
    await expect(page.getByRole("heading", { name: "Itens" })).toBeVisible();
    await expect(page.getByText("Recusado").first()).toBeVisible();
  });

  test("percurso de funil: cupão → upsell recusado → downsell aceite → obrigado", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts");
    const path = await page.locator("a[href^='/checkout/']").first().getAttribute("href");
    // o primeiro checkout listado pode ser o do curso; procurar o do guia (associado ao funil)
    const guideRow = page.getByRole("link", { name: /Checkout — Guia Digital/ }).first();
    await guideRow.click();
    const p = (await page.getByTestId("checkout-path").textContent())!.trim();
    expect(path).toBeTruthy();

    await page.goto(p);
    await expect(page.getByText("CHECKOUT DE DEMONSTRAÇÃO")).toBeVisible();
    await page.getByLabel("Nome completo").fill("Ana Demo");
    await page.getByLabel("Email").fill("ana.demo@exemplo.invalid");
    await page.getByPlaceholder("CÓDIGO").fill("EXPIRADO");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Este cupão expirou.")).toBeVisible();
    await page.getByPlaceholder("CÓDIGO").fill("TESTE10");
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("TESTE10 aplicado")).toBeVisible();
    await expect(page.getByText("R$ 177,30")).toBeVisible();
    await page.getByRole("button", { name: "Comprar agora" }).click();

    await expect(page).toHaveURL(/\/oferta\//);
    await expect(page.getByText("SIMULAÇÃO DE FUNIL")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Adicione o Kit Complementar" })).toBeVisible();
    await page.getByRole("button", { name: "Não, obrigado" }).click();
    await expect(page.getByRole("heading", { name: "Que tal o Mini Guia?" })).toBeVisible();
    await page.getByRole("button", { name: "Sim, quero o Mini Guia" }).click();
    await expect(page.getByRole("heading", { name: "Compra de demonstração concluída" })).toBeVisible();
    await expect(page.getByText("Downsell")).toBeVisible();
    await expect(page.getByText("R$ 224,30")).toBeVisible(); // 177,30 + 47,00
  });

  test("percurso de funil: aceitar upsell vai para obrigado", async ({ page }) => {
    await login(page);
    await page.goto("/checkouts");
    await page.getByRole("link", { name: /Checkout — Guia Digital/ }).first().click();
    const p = (await page.getByTestId("checkout-path").textContent())!.trim();
    await page.goto(p);
    await page.getByLabel("Nome completo").fill("Bruno Demo");
    await page.getByLabel("Email").fill("bruno.demo@exemplo.invalid");
    await page.getByRole("button", { name: "Comprar agora" }).click();
    await page.getByRole("button", { name: "Sim, quero adicionar" }).click();
    await expect(page.getByRole("heading", { name: "Compra de demonstração concluída" })).toBeVisible();
    await expect(page.getByText("Upsell")).toBeVisible();
    await expect(page.getByText("R$ 294,00")).toBeVisible();
  });

  test("relatórios refletem upsells/downsells simulados", async ({ page }) => {
    await login(page);
    await page.goto("/relatorios");
    const row = page.getByRole("row", { name: /Funil de Demonstração/ });
    await expect(row).toContainText("2"); // aceites: 1 downsell + 1 upsell
  });

  test("construtor de funis: simular aceitar e recusar", async ({ page }) => {
    await login(page);
    await page.goto("/funis");
    await page.getByRole("link", { name: /Funil de Demonstração/ }).first().click();
    await expect(page.getByTestId("funnel-canvas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Válido" })).toBeVisible();
    await page.getByRole("button", { name: "Simular" }).click();
    const sim = page.getByTestId("funnel-simulator");
    await sim.getByTestId("sim-decline").click();
    await sim.getByTestId("sim-decline").click();
    await expect(sim.getByTestId("sim-final")).toContainText("Ofertas aceites: nenhuma");
    await sim.getByRole("button", { name: "Recomeçar" }).click();
    await sim.getByTestId("sim-accept").click();
    await expect(sim.getByTestId("sim-final")).toContainText("Kit Complementar");
  });

  test("construtor de funis: criar, adicionar etapas, validação e persistência", async ({ page }) => {
    await login(page);
    await page.goto("/funis");
    await page.getByRole("button", { name: "Novo funil" }).click();
    await page.getByRole("dialog").getByLabel("Nome").fill("Funil E2E");
    await page.getByRole("button", { name: "Criar e abrir editor" }).click();
    await expect(page).toHaveURL(/\/funis\/[a-z0-9]+$/);
    await expect(page.getByTestId("funnel-canvas").locator(".react-flow__node")).toHaveCount(4);
    await expect(page.getByRole("button", { name: /erro/ })).toBeVisible(); // checkout por configurar

    await page.getByTestId("add-UPSELL").click();
    await expect(page.getByTestId("funnel-canvas").locator(".react-flow__node")).toHaveCount(5);
    await page.getByLabel("Nome da etapa").fill("Upsell E2E");
    await page.getByLabel("Título da oferta").fill("Oferta E2E");
    await page.getByRole("button", { name: /erro/ }).click();
    await expect(page.getByTestId("funnel-issues")).toContainText("selecione um checkout");
    await expect(page.getByTestId("funnel-issues")).toContainText("selecione um produto");

    await page.getByRole("button", { name: "Guardar" }).click();
    await toast(page, "Funil guardado");
    await page.reload();
    await expect(page.getByTestId("funnel-canvas").locator(".react-flow__node")).toHaveCount(5);
    await expect(page.getByText("Upsell E2E")).toBeVisible();

    await page.getByRole("button", { name: "Ativar" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Não é possível ativar" }).first()).toBeVisible();
    await expect(page.getByTestId("funnel-issues")).toBeVisible();
  });

  test("desativar demo volta aos dados reais", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
    await page.getByRole("button", { name: "Desativar modo de demonstração" }).click();
    await toast(page, "Modo de demonstração desativado");
    await page.goto("/produtos");
    await expect(page.getByText("Guia Digital Editado").first()).toBeVisible();
    await expect(page.getByText("Guia Digital de Exemplo")).toHaveCount(0);
    await page.goto("/dashboard");
    await expect(page.getByText("R$ 12.450,00")).toHaveCount(0);
  });

  test("remover dados de demonstração", async ({ page }) => {
    await login(page);
    await page.goto("/configuracoes");
    await page.getByRole("button", { name: "Remover dados de demonstração" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Remover" }).click();
    await toast(page, "removidos");
    await expect(page.getByText("0 produtos · 0 checkouts · 0 funis · 0 pedidos")).toBeVisible();
  });
});
