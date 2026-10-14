// Validação CENTRALIZADA da publicação de produtos (servidor). Usada em todos os pontos que podem tornar
// um produto ativo: criar/editar produto, publicar, mudar estado e ativar o funil/checkout.
// Não confia em nada vindo do browser: lê tudo da base de dados, sempre dentro do âmbito da conta.
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { REQUIREMENT_LABELS, internalPageHasContent, isValidDeliveryUrl, normalizeWhatsApp, type ProductStage, type RequirementKey } from "@/lib/product-setup";
import { parseThankYouDesign } from "@/lib/thank-you";
import { own, type Scope } from "@/server/scope";
import { DomainError, NotFoundError } from "./products";

export interface Requirement {
  key: RequirementKey;
  label: string;
  ok: boolean;
  /** O que falta (quando !ok) */
  detail: string;
  /** Onde se configura */
  href: string;
}

export interface Readiness {
  ready: boolean;
  requirements: Requirement[];
  missing: Requirement[];
  mainFunnelId: string | null;
  stage: ProductStage;
}

const PRODUCT_INCLUDE = {
  offers: { where: { isDefault: true }, take: 1 },
  checkouts: { where: { primaryProductId: { not: null } }, select: { id: true, slug: true, isActive: true, funnelId: true } },
  mainFunnel: { include: { thankYouPage: true } },
  deliveryPage: true,
} satisfies Prisma.ProductInclude;

type ProductForReadiness = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/** Avalia os requisitos de um produto já carregado (função pura sobre os dados da BD). */
export function evaluate(p: ProductForReadiness): Readiness {
  const funnel = p.mainFunnel && p.mainFunnel.ownerId === p.ownerId && p.mainFunnel.isDemo === p.isDemo && p.mainFunnel.productId === p.id ? p.mainFunnel : null;
  const funnelHref = funnel ? `/funis/${funnel.id}` : `/funis?criar=${p.id}`;
  const offer = p.offers[0];
  const primary = p.checkouts[0];
  const design = funnel?.thankYouPage ? parseThankYouDesign(funnel.thankYouPage.design) : null;
  const page = p.deliveryPage;

  const req = (key: RequirementKey, ok: boolean, detail: string, href: string): Requirement => ({ key, label: REQUIREMENT_LABELS[key], ok, detail: ok ? "" : detail, href });
  const requirements: Requirement[] = [
    req("product", p.name.trim().length >= 2 && p.description.trim().length >= 10 && Boolean(offer?.isActive && offer.priceCents > 0), "Preencha o nome, a descrição e o preço principal (ativo).", `/produtos/${p.id}`),
    req("checkout", Boolean(primary?.slug), "O checkout principal do produto não existe.", `/produtos/${p.id}`),
    req("funnel", Boolean(funnel), p.mainFunnelId ? "O funil associado não pertence a este produto." : "Crie um funil para este produto na aba Funis.", funnelHref),
    req("thankYou", Boolean(funnel?.thankYouPage && design?.title.trim()), "Configure a página de obrigado no funil.", `${funnelHref}#obrigado`),
    req("whatsapp", Boolean(p.supportWhatsApp && normalizeWhatsApp(p.supportWhatsApp)), p.supportWhatsApp ? "O número de suporte WhatsApp é inválido." : "Indique o número de suporte via WhatsApp.", `${funnelHref}#suporte`),
    req("delivery", p.deliveryMethod !== null, "Escolha o método de entrega: link externo ou página de entrega.", `${funnelHref}#entrega`),
  ];
  if (p.deliveryMethod === "EXTERNAL_LINK") {
    requirements.push(req("deliveryContent", Boolean(p.deliveryUrl && isValidDeliveryUrl(p.deliveryUrl)), "Indique um link de acesso ao produto válido.", `${funnelHref}#entrega`));
  } else if (p.deliveryMethod === "INTERNAL_PAGE") {
    requirements.push(req("deliveryContent", Boolean(page && page.title.trim() && internalPageHasContent(page)), "Configure a página de entrega com um ficheiro, um link ou conteúdo.", `${funnelHref}#entrega`));
  } else {
    requirements.push(req("deliveryContent", false, "Depende do método de entrega escolhido.", `${funnelHref}#entrega`));
  }
  const missing = requirements.filter((r) => !r.ok);
  const ready = missing.length === 0;
  const started = Boolean(funnel || p.supportWhatsApp || p.deliveryMethod);
  const stage: ProductStage =
    p.status === "ARCHIVED" ? "archived" : p.status === "PUBLISHED" ? (ready ? "published" : "published_incomplete") : ready ? "ready" : p.status === "DRAFT" && !started ? "draft" : "incomplete";
  return { ready, requirements, missing, mainFunnelId: funnel?.id ?? null, stage };
}

export async function getReadiness(productId: string, scope: Scope): Promise<Readiness> {
  const p = await prisma.product.findFirst({ where: { id: productId, ...own(scope) }, include: PRODUCT_INCLUDE });
  if (!p) throw new NotFoundError("Produto");
  return evaluate(p);
}

/** Readiness de vários produtos (lista de produtos / funis), numa só consulta. */
export async function readinessMap(productIds: string[], scope: Scope): Promise<Map<string, Readiness>> {
  if (!productIds.length) return new Map();
  const rows = await prisma.product.findMany({ where: { id: { in: productIds }, ...own(scope) }, include: PRODUCT_INCLUDE });
  return new Map(rows.map((p) => [p.id, evaluate(p)]));
}

/** Erro de publicação com a lista exata do que falta (mostrada ao utilizador). */
export class PublishBlockedError extends DomainError {
  constructor(public readonly missing: Requirement[]) {
    super(`Produto incompleto — falta: ${missing.map((m) => m.label.toLowerCase()).join(", ")}.`);
  }
}

/** Lança PublishBlockedError se o produto não puder ser publicado. */
export async function assertPublishable(productId: string, scope: Scope): Promise<Readiness> {
  const r = await getReadiness(productId, scope);
  if (!r.ready) throw new PublishBlockedError(r.missing);
  return r;
}
