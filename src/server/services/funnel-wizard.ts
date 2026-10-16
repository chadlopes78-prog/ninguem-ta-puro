// Funis criados pelo assistente (produto inicial → upsell opcional → página de obrigado).
// Reutiliza o motor de funis existente: o assistente escreve o mesmo grafo que o editor avançado.
import "server-only";
import { prisma } from "@/server/db";
import { buildWizardGraph, downsellFromGraph, offersFromGraph, thankYouStepFromGraph, upsellFromGraph, wizardSchema, type FunnelOffer, type UpsellConfig, type WizardInput } from "@/lib/funnels/wizard";
import { defaultThankYouAction, defaultThankYouDesign, parseThankYouAction, parseThankYouDesign, type ThankYouAction, type ThankYouDesign } from "@/lib/thank-you";
import { internalPageHasContent, normalizeWhatsApp } from "@/lib/product-setup";
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
export async function createWizardFunnel(productId: string, scope: Scope, name?: string) {
  const product = await productInScope(productId, scope);
  if (product.status === "ARCHIVED") throw new DomainError("Este produto está arquivado.");
  const checkout = await ensurePrimaryCheckout(product.id);
  const graph = buildWizardGraph({ checkoutId: checkout.id, productName: product.name, offers: [], thankYou: { title: defaultThankYouDesign().title, stepName: "Página de obrigado", useSitePage: true, redirectUrl: "" } });
  const funnel = await createFunnel({ name: (name?.trim() || `Funil — ${product.name}`).slice(0, 100) }, scope, graph);
  await prisma.$transaction([
    prisma.funnel.update({ where: { id: funnel.id }, data: { productId: product.id } }),
    prisma.thankYouPage.create({ data: { funnelId: funnel.id, design: defaultThankYouDesign(), action: defaultThankYouAction() } }),
    // o primeiro funil de um produto passa a ser o principal
    prisma.product.updateMany({ where: { id: product.id, mainFunnelId: null }, data: { mainFunnelId: funnel.id } }),
  ]);
  return funnel;
}

export interface WizardSetup {
  support: { phone: string; message: string };
  delivery: {
    method: "EXTERNAL_LINK" | "INTERNAL_PAGE" | null;
    url: string;
    page: { title: string; welcome: string; instructions: string; bodyText: string; buttonText: string; resourceUrl: string; fileId: string | null };
  };
  isMain: boolean;
}

export interface WizardState {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  productId: string;
  afterPayment: "upsell" | "thank_you";
  /** Etapas de oferta (upsells/downsells) pela ordem do funil */
  offers: FunnelOffer[];
  /** Compatibilidade: primeiro upsell/downsell no formato anterior */
  upsell: UpsellConfig | null;
  downsell: UpsellConfig | null;
  thankYou: { design: ThankYouDesign; action: ThankYouAction | null; fileId: string | null; stepName: string; useSitePage: boolean; redirectUrl: string };
  setup: WizardSetup;
}

export async function getWizardFunnel(id: string, scope: Scope) {
  const f = await getFunnelRecord(id, scope);
  if (!f.productId) return null; // funil avançado: usa o editor visual
  const [page, product] = await Promise.all([
    prisma.thankYouPage.findUnique({ where: { funnelId: f.id } }),
    prisma.product.findFirst({ where: { id: f.productId, ...own(scope) }, include: { offers: { where: { isDefault: true }, take: 1 }, deliveryPage: true, files: { select: { id: true, filename: true, sizeBytes: true, createdAt: true }, orderBy: { createdAt: "desc" } } } }),
  ]);
  if (!product) throw new NotFoundError("Produto");
  const checkout = await ensurePrimaryCheckout(product.id);
  const graph = toGraph(f);
  const upsell = upsellFromGraph(graph);
  const offers = offersFromGraph(graph);
  const state: WizardState = {
    id: f.id,
    name: f.name,
    status: f.status,
    productId: product.id,
    afterPayment: upsell ? "upsell" : "thank_you",
    offers,
    upsell,
    downsell: downsellFromGraph(graph),
    thankYou: { design: parseThankYouDesign(page?.design), action: parseThankYouAction(page?.action), fileId: page?.fileId ?? null, ...thankYouStepFromGraph(graph) },
    setup: {
      support: { phone: product.supportWhatsApp ?? "", message: product.supportMessage ?? "" },
      delivery: {
        method: product.deliveryMethod,
        url: product.deliveryUrl ?? "",
        page: {
          title: product.deliveryPage?.title ?? "O seu produto está pronto",
          welcome: product.deliveryPage?.welcome ?? "",
          instructions: product.deliveryPage?.instructions ?? "",
          bodyText: product.deliveryPage?.bodyText ?? "",
          buttonText: product.deliveryPage?.buttonText ?? "ACEDER AO MEU PRODUTO",
          resourceUrl: product.deliveryPage?.resourceUrl ?? "",
          fileId: product.deliveryPage?.fileId ?? null,
        },
      },
      isMain: product.mainFunnelId === null || product.mainFunnelId === f.id,
    },
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

  // Cada oferta: produto da própria conta (não arquivado) e preço ativo desse produto. Sem preço escolhido,
  // usa o preço principal do produto. O valor cobrado vem sempre da base de dados, nunca do browser.
  const offers: FunnelOffer[] = [];
  for (const [i, o] of input.offers.entries()) {
    const label = o.type === "DOWNSELL" ? "downsell" : "upsell";
    const p = await prisma.product.findFirst({ where: { id: o.productId, ...own(scope) }, include: { offers: { where: { isActive: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] } } });
    if (!p || p.status === "ARCHIVED") return { ok: false, error: `Produto do ${label} “${o.name}” inválido.`, fieldErrors: { [`offers.${i}.productId`]: "Selecione um produto da sua conta" } };
    const price = o.offerId ? p.offers.find((x) => x.id === o.offerId) : p.offers[0];
    if (!price) {
      const inactive = o.offerId ? await prisma.offer.findFirst({ where: { id: o.offerId, productId: p.id } }) : null;
      return { ok: false, error: inactive ? `O preço escolhido para o ${label} está inativo.` : `Produto ou preço do ${label} inválido.`, fieldErrors: { [`offers.${i}.offerId`]: inactive ? "Preço inativo" : "Selecione um preço do produto" } };
    }
    offers.push({ ...o, offerId: price.id });
  }
  if (input.thankYou.fileId) {
    const file = await prisma.productFile.findFirst({ where: { id: input.thankYou.fileId, productId: product.id } });
    if (!file) return { ok: false, error: "O PDF selecionado não pertence ao produto inicial.", fieldErrors: { "thankYou.fileId": "PDF inválido" } };
  }
  // Ficheiro da página de entrega: tem de ser um ficheiro DESTE produto (IDs alterados no browser são recusados)
  const pageFileId = input.delivery.page.fileId;
  if (pageFileId && !(await prisma.productFile.findFirst({ where: { id: pageFileId, productId: product.id } }))) {
    return { ok: false, error: "O ficheiro escolhido não pertence a este produto.", fieldErrors: { "delivery.page.fileId": "Ficheiro inválido" } };
  }
  // Um funil não pode mudar de produto enquanto for o principal de um produto publicado
  if (f.productId !== product.id) {
    const mainOf = await prisma.product.findFirst({ where: { mainFunnelId: f.id, status: "PUBLISHED", ...own(scope) } });
    if (mainOf) return { ok: false, error: `Este funil é o principal do produto publicado “${mainOf.name}”. Despublique-o ou associe outro funil antes de mudar o produto.`, fieldErrors: { productId: "Funil em uso" } };
  }
  // Produto publicado: a configuração obrigatória não pode ficar incompleta
  if (product.status === "PUBLISHED" && (product.mainFunnelId === f.id || product.mainFunnelId === null)) {
    if (!input.support.phone) return { ok: false, error: "O produto está publicado: o número de suporte WhatsApp é obrigatório.", fieldErrors: { "support.phone": "Obrigatório" } };
    if (!input.delivery.method) return { ok: false, error: "O produto está publicado: escolha o método de entrega.", fieldErrors: { "delivery.method": "Obrigatório" } };
    if (input.delivery.method === "EXTERNAL_LINK" && !input.delivery.url) return { ok: false, error: "O produto está publicado: indique o link de acesso ao produto.", fieldErrors: { "delivery.url": "Obrigatório" } };
    if (input.delivery.method === "INTERNAL_PAGE" && !internalPageHasContent({ fileId: pageFileId, resourceUrl: input.delivery.page.resourceUrl || null, bodyText: input.delivery.page.bodyText })) {
      return { ok: false, error: "O produto está publicado: a página de entrega precisa de um ficheiro, um link ou conteúdo.", fieldErrors: { "delivery.page.bodyText": "Configure o conteúdo entregue" } };
    }
  }

  const checkout = await ensurePrimaryCheckout(product.id);
  const ty = input.thankYou;
  const graph = buildWizardGraph({ checkoutId: checkout.id, productName: product.name, offers, thankYou: { title: ty.design.title, stepName: ty.stepName, useSitePage: ty.useSitePage, redirectUrl: ty.redirectUrl } });
  const productChanged = f.productId !== product.id;
  const { validation, deactivated } = await saveFunnel(id, { name: input.name, graph }, scope);

  const existingPage = await prisma.thankYouPage.findUnique({ where: { funnelId: id } });
  const action = input.thankYou.action ?? parseThankYouAction(existingPage?.action) ?? defaultThankYouAction();
  const usesPdf = action.type === "product" && action.delivery === "pdf";
  // sem `action` no pedido (novo editor), o PDF da configuração anterior mantém-se
  const legacyFileId = input.thankYou.action ? (usesPdf ? input.thankYou.fileId : null) : (existingPage?.fileId ?? null);
  const phone = input.support.phone ? normalizeWhatsApp(input.support.phone) : null;
  const d = input.delivery;
  await prisma.$transaction(async (tx) => {
    await tx.funnel.update({ where: { id }, data: { productId: product.id } });
    await tx.thankYouPage.upsert({
      where: { funnelId: id },
      create: { funnelId: id, design: input.thankYou.design, action, fileId: legacyFileId },
      update: { design: input.thankYou.design, action, fileId: legacyFileId },
    });
    // Suporte e entrega pertencem ao PRODUTO (servem a página de obrigado e a página de entrega)
    const becomesMain = input.isMain || product.mainFunnelId === null || product.mainFunnelId === id;
    await tx.product.update({
      where: { id: product.id },
      data: {
        supportWhatsApp: phone,
        supportMessage: input.support.message || null,
        deliveryMethod: d.method,
        ...(d.method === "EXTERNAL_LINK" ? { deliveryUrl: d.url || null } : {}),
        ...(becomesMain ? { mainFunnelId: id } : {}),
      },
    });
    if (d.method === "INTERNAL_PAGE") {
      const pageData = { title: d.page.title, welcome: d.page.welcome, instructions: d.page.instructions, bodyText: d.page.bodyText, buttonText: d.page.buttonText, resourceUrl: d.page.resourceUrl || null, fileId: d.page.fileId };
      await tx.deliveryPage.upsert({ where: { productId: product.id }, create: { productId: product.id, ...pageData }, update: pageData });
    }
    // O produto anterior deixa de ter este funil como principal
    if (productChanged) await tx.product.updateMany({ where: { mainFunnelId: id, id: { not: product.id }, ...own(scope) }, data: { mainFunnelId: null } });
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
    // a página de obrigado é obrigatória; o botão de acesso segue a entrega do produto (validada na publicação)
    const page = await prisma.thankYouPage.findUnique({ where: { funnelId: id } });
    if (!page) return { valid: false, errors: [{ level: "error", message: "Configure a página de obrigado do funil." }], warnings: [] };
  }
  return activateFunnel(id, scope);
}

/** Desativa e desliga o checkout: novas compras deixam de seguir este funil (compras já feitas mantêm o percurso). */
export async function deactivateWizardFunnel(id: string, scope: Scope) {
  await getFunnelRecord(id, scope);
  const mainOf = await prisma.product.findFirst({ where: { mainFunnelId: id, status: "PUBLISHED", ...own(scope) } });
  if (mainOf) throw new DomainError(`Este é o funil principal do produto publicado “${mainOf.name}”: despublique o produto antes de desativar o funil.`);
  await prisma.$transaction([
    prisma.funnel.update({ where: { id }, data: { status: "INACTIVE" } }),
    prisma.checkout.updateMany({ where: { funnelId: id, ...own(scope) }, data: { funnelId: null } }),
  ]);
}
