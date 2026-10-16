// Validação CENTRALIZADA da publicação de produtos (servidor). Usada em todos os pontos que podem tornar
// um produto ativo: criar/editar produto, publicar, mudar estado e ativar o funil/checkout.
// Não confia em nada vindo do browser: lê tudo da base de dados, sempre dentro do âmbito da conta.
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { REQUIREMENT_LABELS, internalPageHasContent, isValidDeliveryUrl, type ProductStage, type RequirementKey } from "@/lib/product-setup";
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
  deliveryFile: { select: { id: true, productId: true } },
} satisfies Prisma.ProductInclude;

type ProductForReadiness = Prisma.ProductGetPayload<{ include: typeof PRODUCT_INCLUDE }>;

/**
 * Avalia os requisitos ESSENCIAIS para vender (função pura sobre os dados da BD): produto com nome, descrição e
 * preço ativo, checkout principal e entrega (método + ficheiro/link/página). Funil, página de obrigado,
 * WhatsApp, upsell e downsell são opcionais e nunca impedem a publicação (modo simples: checkout padrão →
 * pagamento confirmado → acesso ao produto).
 */
export function evaluate(p: ProductForReadiness): Readiness {
  const funnel = p.mainFunnel && p.mainFunnel.ownerId === p.ownerId && p.mainFunnel.isDemo === p.isDemo && p.mainFunnel.productId === p.id ? p.mainFunnel : null;
  const offer = p.offers[0];
  const primary = p.checkouts[0];
  const page = p.deliveryPage;
  const deliveryHref = `/produtos/${p.id}#entrega`;

  const req = (key: RequirementKey, ok: boolean, detail: string, href: string): Requirement => ({ key, label: REQUIREMENT_LABELS[key], ok, detail: ok ? "" : detail, href });
  const requirements: Requirement[] = [
    req("product", p.name.trim().length >= 2 && p.description.trim().length >= 10 && Boolean(offer?.isActive && offer.priceCents > 0), "Preencha o nome, a descrição e o preço principal (ativo).", `/produtos/${p.id}`),
    req("checkout", Boolean(primary?.slug), "O checkout principal do produto não existe.", `/produtos/${p.id}`),
    req("delivery", p.deliveryMethod !== null, "Escolha como o cliente recebe o produto: ficheiro (PDF) ou link de acesso.", deliveryHref),
  ];
  if (p.deliveryMethod === "FILE") {
    requirements.push(req("deliveryContent", Boolean(p.deliveryFile && p.deliveryFile.productId === p.id), "Carregue o ficheiro do produto.", deliveryHref));
  } else if (p.deliveryMethod === "EXTERNAL_LINK") {
    requirements.push(req("deliveryContent", Boolean(p.deliveryUrl && isValidDeliveryUrl(p.deliveryUrl)), "Indique um link de acesso ao produto válido.", deliveryHref));
  } else if (p.deliveryMethod === "INTERNAL_PAGE") {
    requirements.push(req("deliveryContent", Boolean(page && page.title.trim() && internalPageHasContent(page)), "Configure a página de entrega com um ficheiro, um link ou conteúdo.", funnel ? `/funis/${funnel.id}#entrega` : deliveryHref));
  } else {
    requirements.push(req("deliveryContent", false, "Depende do método de entrega escolhido.", deliveryHref));
  }
  const missing = requirements.filter((r) => !r.ok);
  const ready = missing.length === 0;
  const started = Boolean(funnel || p.deliveryMethod);
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
