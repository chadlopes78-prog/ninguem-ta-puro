// Funis criados pelo assistente (produto inicial → upsell opcional → página de obrigado).
// Reutiliza o motor de funis existente: o assistente escreve o mesmo grafo que o editor avançado.
import "server-only";
import { prisma } from "@/server/db";
import { buildWizardGraph, upsellFromGraph, wizardSchema, type UpsellConfig, type WizardInput } from "@/lib/funnels/wizard";
import { defaultThankYouAction, defaultThankYouDesign, parseThankYouAction, parseThankYouDesign, type ThankYouAction, type ThankYouDesign } from "@/lib/thank-you";
import { flattenErrors } from "@/server/validation/common";
import { ensurePrimaryCheckout, checkoutPath } from "./primary-checkout";
import { activateFunnel, createFunnel, getFunnelRecord, saveFunnel, toGraph } from "./funnels";
import { DomainError, NotFoundError } from "./products";
import type { FunnelValidation } from "@/lib/funnels/validate";
import { own, type Scope } from "@/server/scope";

async function productInScope(productId: string, scope: Scope) {
  const p = await prisma.product.findFirst({ where: { id: productId, ...own(scope) }, include: { offers: { where: { isDefault: true }, take: 1 } } });
  if (!p) throw new NotFoundError("Produto");
  return p;
}

/** Cria um funil do assistente para um produto, com a página de obrigado no modelo padrão. */
export async function createWizardFunnel(productId: string, scope: Scope) {
  const product = await productInScope(productId, scope);
  if (product.status === "ARCHIVED") throw new DomainError("Este produto está arquivado.");
  const checkout = await ensurePrimaryCheckout(product.id);
  const graph = buildWizardGraph({ checkoutId: checkout.id, productName: product.name, afterPayment: "thank_you", thankYouTitle: defaultThankYouDesign().title });
  const funnel = await createFunnel({ name: `Funil — ${product.name}`.slice(0, 100) }, scope, graph);
  await prisma.$transaction([
    prisma.funnel.update({ where: { id: funnel.id }, data: { productId: product.id } }),
    prisma.thankYouPage.create({ data: { funnelId: funnel.id, design: defaultThankYouDesign(), action: defaultThankYouAction() } }),
  ]);
  return funnel;
}

export interface WizardState {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  productId: string;
  afterPayment: "upsell" | "thank_you";
  upsell: UpsellConfig | null;
  thankYou: { design: ThankYouDesign; action: ThankYouAction | null; fileId: string | null };
}

export async function getWizardFunnel(id: string, scope: Scope) {
  const f = await getFunnelRecord(id, scope);
  if (!f.productId) return null; // funil avançado: usa o editor visual
  const [page, product] = await Promise.all([
    prisma.thankYouPage.findUnique({ where: { funnelId: f.id } }),
    prisma.product.findFirst({ where: { id: f.productId, ...own(scope) }, include: { offers: { where: { isDefault: true }, take: 1 }, files: { select: { id: true, filename: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "desc" } } } }),
  ]);
  if (!product) throw new NotFoundError("Produto");
  const checkout = await ensurePrimaryCheckout(product.id);
  const graph = toGraph(f);
  const upsell = upsellFromGraph(graph);
  const state: WizardState = {
    id: f.id,
    name: f.name,
    status: f.status,
    productId: product.id,
    afterPayment: upsell ? "upsell" : "thank_you",
    upsell,
    thankYou: { design: parseThankYouDesign(page?.design), action: parseThankYouAction(page?.action), fileId: page?.fileId ?? null },
  };
  return { state, product, checkout: { id: checkout.id, path: checkoutPath(checkout), isActive: checkout.isActive } };
}

export type SaveWizardResult = { ok: true; validation: FunnelValidation; deactivated: boolean } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * Guarda a configuração do assistente: valida tudo no servidor (produtos e ofertas do âmbito, PDF do produto),
 * gera o grafo e atualiza a página de obrigado. Mudar o produto inicial de um funil ativo volta a associar o checkout.
 */
export async function saveWizardFunnel(id: string, raw: unknown, scope: Scope): Promise<SaveWizardResult> {
  const f = await getFunnelRecord(id, scope);
  if (!f.productId) return { ok: false, error: "Este funil usa o editor avançado." };
  const parsed = wizardSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: flattenErrors(parsed.error) };
  const input: WizardInput = parsed.data;

  const product = await prisma.product.findFirst({ where: { id: input.productId, ...own(scope) } });
  if (!product) return { ok: false, error: "Produto inicial inválido.", fieldErrors: { productId: "Selecione um produto" } };
  if (product.status === "ARCHIVED") return { ok: false, error: "O produto inicial está arquivado.", fieldErrors: { productId: "Produto arquivado" } };

  if (input.afterPayment === "upsell" && input.upsell) {
    const offer = await prisma.offer.findFirst({ where: { id: input.upsell.offerId, productId: input.upsell.productId, product: own(scope) }, include: { product: true } });
    if (!offer || offer.product.status === "ARCHIVED") return { ok: false, error: "Produto ou preço do upsell inválido.", fieldErrors: { "upsell.offerId": "Selecione um preço do produto" } };
    if (!offer.isActive) return { ok: false, error: "O preço escolhido para o upsell está inativo.", fieldErrors: { "upsell.offerId": "Preço inativo" } };
  }
  if (input.thankYou.fileId) {
    const file = await prisma.productFile.findFirst({ where: { id: input.thankYou.fileId, productId: product.id } });
    if (!file) return { ok: false, error: "O PDF selecionado não pertence ao produto inicial.", fieldErrors: { "thankYou.fileId": "PDF inválido" } };
  }

  const checkout = await ensurePrimaryCheckout(product.id);
  const graph = buildWizardGraph({ checkoutId: checkout.id, productName: product.name, afterPayment: input.afterPayment, upsell: input.upsell, thankYouTitle: input.thankYou.design.title });
  const productChanged = f.productId !== product.id;
  const { validation, deactivated } = await saveFunnel(id, { name: input.name, graph }, scope);

  const usesPdf = input.thankYou.action.type === "product" && input.thankYou.action.delivery === "pdf";
  await prisma.$transaction(async (tx) => {
    await tx.funnel.update({ where: { id }, data: { productId: product.id } });
    await tx.thankYouPage.upsert({
      where: { funnelId: id },
      create: { funnelId: id, design: input.thankYou.design, action: input.thankYou.action, fileId: usesPdf ? input.thankYou.fileId : null },
      update: { design: input.thankYou.design, action: input.thankYou.action, fileId: usesPdf ? input.thankYou.fileId : null },
    });
    // O checkout antigo deixa de encaminhar para este funil quando o produto inicial muda
    if (productChanged) await tx.checkout.updateMany({ where: { funnelId: id, id: { not: checkout.id } }, data: { funnelId: null } });
  });
  // Funil ativo com novo produto: liga o novo checkout (com verificação de conflitos)
  if (productChanged && f.status === "ACTIVE" && !deactivated) {
    const v = await activateWizardFunnel(id, scope);
    if (!v.valid) return { ok: false, error: v.errors[0]?.message ?? "Não foi possível ativar o funil com o novo produto." };
  }
  return { ok: true, validation, deactivated };
}

/** Ativa: valida e associa o checkout do produto inicial (um único funil ativo por checkout). */
export async function activateWizardFunnel(id: string, scope: Scope): Promise<FunnelValidation> {
  const f = await getFunnelRecord(id, scope);
  if (f.productId) {
    const page = await prisma.thankYouPage.findUnique({ where: { funnelId: id } });
    const action = parseThankYouAction(page?.action);
    if (!action) return { valid: false, errors: [{ level: "error", message: "Configure o destino do botão da página de obrigado." }], warnings: [] };
    if (action.type === "product" && action.delivery === "pdf" && !page?.fileId) {
      return { valid: false, errors: [{ level: "error", message: "Carregue o PDF do produto na página de obrigado." }], warnings: [] };
    }
  }
  return activateFunnel(id, scope);
}

/** Desativa e desliga o checkout: novas compras deixam de seguir este funil (compras já feitas mantêm o percurso). */
export async function deactivateWizardFunnel(id: string, scope: Scope) {
  await getFunnelRecord(id, scope);
  await prisma.$transaction([
    prisma.funnel.update({ where: { id }, data: { status: "INACTIVE" } }),
    prisma.checkout.updateMany({ where: { funnelId: id, ...own(scope) }, data: { funnelId: null } }),
  ]);
}
