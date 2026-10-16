// Facebook Pixel / API de Conversões (Meta): evento Purchase das vendas CONFIRMADAS dos produtos escolhidos.
//
// Garantias:
//  - só encomendas APROVADAS (aprovação feita exclusivamente por applyPaymentStatus, depois de validar montante e
//    moeda com o gateway) — nunca checkout aberto, pagamento iniciado, pendente, falhado ou demonstração;
//  - um evento por (Pixel, encomenda) na base de dados (chave única) e o mesmo event_id em todas as tentativas:
//    webhooks/consultas repetidas não criam compras duplicadas; envio reivindicado (lock) antes de enviar;
//  - isolamento: o Pixel, os produtos e as encomendas são sempre da mesma conta; o token de uma conta nunca é
//    usado para outra;
//  - o token fica cifrado (secret-box) e só é decifrado no momento do envio; vai no CORPO do pedido (a Graph API
//    aceita access_token no corpo), nunca no URL, em logs, mensagens de erro ou respostas para o browser;
//  - dados pessoais: só email, telefone e ID de cliente com hash SHA-256 (como a Meta exige), o navegador e o
//    clique do anúncio (fbc). Nunca nome, morada, IP ou dados em texto simples.
// Formato: https://developers.facebook.com/docs/marketing-api/conversions-api (POST /{pixel_id}/events).
import "server-only";
import { createHash } from "crypto";
import type { MetaEvent, MetaPixel, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db";
import { decryptSecret, encryptSecret, secretStorageAvailable } from "@/server/secret-box";
import { DomainError, NotFoundError } from "@/server/services/products";
import type { Scope } from "@/server/scope";
import { staticAppBaseUrl } from "@/server/app-url";
import type { FieldErrors } from "@/server/validation/common";
import { flattenErrors } from "@/server/validation/common";

export const META_API_VERSION = "v21.0";
const GRAPH = "https://graph.facebook.com";
/** A Meta só aceita eventos com event_time nos últimos 7 dias. */
const MAX_AGE_MS = 7 * 24 * 60 * 60_000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 2 * 60_000;

// ───────────── validação ─────────────

export const metaPixelSchema = z.object({
  id: z.string().regex(/^[a-z0-9]{10,40}$/i).optional(),
  pixelId: z.string().trim().regex(/^\d{6,20}$/, "O ID do Pixel tem só algarismos (ex.: 123456789012345)."),
  /** Vazio na edição = manter o token guardado */
  token: z
    .string()
    .trim()
    .max(1024, "Token demasiado longo.")
    .refine((v) => v === "" || /^[A-Za-z0-9_\-.|]{20,1024}$/.test(v), "Token inválido. Copie o token gerado no Events Manager (sem espaços).")
    .default(""),
  testEventCode: z
    .string()
    .trim()
    .max(40)
    .refine((v) => v === "" || /^[A-Za-z0-9]{3,40}$/.test(v), "Código de teste inválido (ex.: TEST12345).")
    .default(""),
  enabled: z.boolean().default(true),
  productIds: z.array(z.string().regex(/^[a-z0-9]{10,40}$/i)).max(500).default([]),
});
export type MetaPixelInput = z.input<typeof metaPixelSchema>;

export interface MetaPixelView {
  id: string;
  pixelId: string;
  tokenHint: string;
  testEventCode: string;
  enabled: boolean;
  productIds: string[];
  lastSentAt: Date | null;
  lastError: string | null;
  stats: { sent: number; pending: number; failed: number };
}

function hint(token: string) {
  return `••••${token.slice(-4)}`;
}

/** Remove o token (e fragmentos longos parecidos) de qualquer texto antes de o guardar ou mostrar. */
function scrub(text: string, token?: string | null) {
  let t = text;
  if (token) t = t.split(token).join("[token]");
  return t.replace(/EAA[A-Za-z0-9]{10,}/g, "[token]").replace(/access_token=[^&\s"]+/gi, "access_token=[token]").slice(0, 300);
}

// ───────────── configuração (sempre da conta autenticada) ─────────────

export async function listMetaPixels(scope: Scope): Promise<MetaPixelView[]> {
  const pixels = await prisma.metaPixel.findMany({ where: { ownerId: scope.ownerId }, orderBy: { createdAt: "asc" }, include: { products: { select: { productId: true } } } });
  const counts = await prisma.metaEvent.groupBy({ by: ["metaPixelId", "status"], where: { ownerId: scope.ownerId }, _count: true });
  return pixels.map((p) => {
    const c = (s: MetaEvent["status"]) => counts.find((x) => x.metaPixelId === p.id && x.status === s)?._count ?? 0;
    return {
      id: p.id,
      pixelId: p.pixelId,
      tokenHint: p.tokenHint,
      testEventCode: p.testEventCode ?? "",
      enabled: p.enabled,
      productIds: p.products.map((x) => x.productId),
      lastSentAt: p.lastSentAt,
      lastError: p.lastError,
      stats: { sent: c("SENT"), pending: c("PENDING"), failed: c("FAILED") },
    };
  });
}

/** Produtos REAIS da conta que podem ser escolhidos (os arquivados só aparecem se já estiverem selecionados). */
export async function listMetaProductOptions(scope: Scope, selected: string[] = []) {
  return prisma.product.findMany({
    where: { ownerId: scope.ownerId, isDemo: false, OR: [{ status: { not: "ARCHIVED" } }, { id: { in: selected } }] },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
    take: 500,
  });
}

export type SaveMetaResult = { ok: true; id: string } | { ok: false; error: string; fieldErrors?: FieldErrors };

export async function saveMetaPixel(scope: Scope, raw: unknown): Promise<SaveMetaResult> {
  if (scope.isDemo) return { ok: false, error: "Desative o modo de demonstração para configurar o Pixel (as vendas de demonstração nunca são enviadas)." };
  const parsed = metaPixelSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Corrija os campos assinalados.", fieldErrors: flattenErrors(parsed.error) };
  const input = parsed.data;
  if (!secretStorageAvailable()) return { ok: false, error: "O servidor não tem chave de cifra disponível para guardar o token com segurança." };

  // Só produtos reais da própria conta (IDs alterados no browser são recusados)
  const productIds = [...new Set(input.productIds)];
  if (productIds.length) {
    const own = await prisma.product.count({ where: { id: { in: productIds }, ownerId: scope.ownerId, isDemo: false } });
    if (own !== productIds.length) return { ok: false, error: "Um dos produtos escolhidos não pertence a esta conta.", fieldErrors: { productIds: "Seleção inválida" } };
  }

  const existing = input.id ? await prisma.metaPixel.findFirst({ where: { id: input.id, ownerId: scope.ownerId } }) : null;
  if (input.id && !existing) throw new NotFoundError("Pixel");
  if (!existing && !input.token) return { ok: false, error: "Introduza o token de acesso da API de Conversões.", fieldErrors: { token: "Obrigatório" } };
  const clash = await prisma.metaPixel.findFirst({ where: { ownerId: scope.ownerId, pixelId: input.pixelId, ...(existing ? { id: { not: existing.id } } : {}) } });
  if (clash) return { ok: false, error: "Este Pixel já está configurado nesta conta.", fieldErrors: { pixelId: "Já configurado" } };

  const secret = input.token ? { tokenEnc: encryptSecret(input.token), tokenHint: hint(input.token), lastError: null } : {};
  const data = { pixelId: input.pixelId, testEventCode: input.testEventCode || null, enabled: input.enabled };
  const id = await prisma.$transaction(async (tx) => {
    const p = existing
      ? await tx.metaPixel.update({ where: { id: existing.id }, data: { ...data, ...secret } })
      : await tx.metaPixel.create({ data: { ...data, ownerId: scope.ownerId, tokenEnc: secret.tokenEnc!, tokenHint: secret.tokenHint! } });
    // produtos desmarcados deixam de ser enviados; novos só contam para vendas a partir de agora
    await tx.metaPixelProduct.deleteMany({ where: { metaPixelId: p.id, productId: { notIn: productIds } } });
    if (productIds.length) await tx.metaPixelProduct.createMany({ data: productIds.map((productId) => ({ metaPixelId: p.id, productId })), skipDuplicates: true });
    return p.id;
  });
  return { ok: true, id };
}

/** Ativa ou desativa todos os Pixels da conta (interruptor do cartão na aba Integrações). Nada é apagado. */
export async function setMetaPixelsEnabled(scope: Scope, enabled: boolean) {
  const r = await prisma.metaPixel.updateMany({ where: { ownerId: scope.ownerId }, data: { enabled } });
  return r.count;
}

export async function deleteMetaPixel(scope: Scope, id: string) {
  const p = await prisma.metaPixel.findFirst({ where: { id, ownerId: scope.ownerId } });
  if (!p) throw new NotFoundError("Pixel");
  await prisma.metaPixel.delete({ where: { id: p.id } });
}

// ───────────── contexto técnico da compra (navegador, clique do anúncio) ─────────────

/** Guardado pela ação do checkout DEPOIS de a compra ser criada; nunca altera nem atrasa a compra. */
export async function recordTrackingContext(publicToken: string, ctx: { userAgent?: string | null; referer?: string | null }) {
  try {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(publicToken)) return;
    const order = await prisma.order.findUnique({ where: { publicToken }, select: { id: true, isDemo: true } });
    if (!order || order.isDemo) return;
    let fbc: string | null = null;
    let sourceUrl: string | null = null;
    if (ctx.referer) {
      try {
        const u = new URL(ctx.referer);
        const fbclid = u.searchParams.get("fbclid");
        // formato oficial do parâmetro fbc: fb.1.<criação em ms>.<fbclid>
        if (fbclid && /^[A-Za-z0-9_-]{10,500}$/.test(fbclid)) fbc = `fb.1.${Date.now()}.${fbclid}`;
        sourceUrl = `${u.origin}${u.pathname}`.slice(0, 500); // sem a query (pode ter dados do comprador)
      } catch {}
    }
    const userAgent = ctx.userAgent?.slice(0, 500) || null;
    await prisma.orderTrackingContext.upsert({ where: { orderId: order.id }, create: { orderId: order.id, userAgent, fbc, sourceUrl }, update: {} });
  } catch (e) {
    console.error("[meta] contexto", e instanceof Error ? e.message : "erro");
  }
}

// ───────────── criação idempotente dos eventos a partir das vendas confirmadas ─────────────

/**
 * Cria (uma única vez) o evento Purchase de cada encomenda APROVADA, não demonstração, nos últimos 7 dias, com um
 * produto selecionado num Pixel ativo da MESMA conta, aprovada depois de o produto ser selecionado. Upsells e
 * downsells são encomendas próprias: cada uma gera o seu evento conforme os seus produtos.
 */
export async function syncMetaPurchases(now = new Date()): Promise<number> {
  const pixels = await prisma.metaPixel.findMany({ where: { enabled: true, products: { some: {} } }, include: { products: true } });
  let created = 0;
  for (const px of pixels) {
    const since = new Date(Math.max(now.getTime() - MAX_AGE_MS, Math.min(...px.products.map((p) => p.createdAt.getTime()))));
    const orders = await prisma.order.findMany({
      where: {
        ownerId: px.ownerId,
        isDemo: false,
        status: "APPROVED",
        approvedAt: { gte: since },
        items: { some: { productId: { in: px.products.map((p) => p.productId) } } },
        metaEvents: { none: { metaPixelId: px.id } },
        // pagamentos de teste (sandbox) só com código de eventos de teste (aparecem só no separador "Testar eventos")
        ...(px.testEventCode ? {} : { isTestPayment: false }),
      },
      select: { id: true, approvedAt: true, items: { select: { productId: true } } },
      take: 200,
    });
    const selectedAt = new Map(px.products.map((p) => [p.productId, p.createdAt.getTime()]));
    const due = orders.filter((o) => o.items.some((i) => selectedAt.has(i.productId) && o.approvedAt!.getTime() >= selectedAt.get(i.productId)!));
    if (!due.length) continue;
    const r = await prisma.metaEvent.createMany({
      data: due.map((o) => ({ ownerId: px.ownerId, metaPixelId: px.id, orderId: o.id, eventId: `purchase_${o.id}`, nextAttemptAt: now })),
      skipDuplicates: true, // chave única (Pixel, encomenda): nunca duas compras para a mesma transação
    });
    created += r.count;
  }
  return created;
}

// ───────────── envio ─────────────

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
function normPhone(p: string | null): string | null {
  const d = (p ?? "").replace(/\D/g, "");
  if (!d) return null;
  return d.length === 9 && /^8/.test(d) ? `258${d}` : d; // números moçambicanos com indicativo
}

type EventOrder = Prisma.OrderGetPayload<{ include: { customer: true; items: { include: { product: { select: { id: true; name: true } } } }; trackingContext: true; parentOrder: { include: { trackingContext: true } }; checkout: { select: { slug: true } } } }>;

/** Evento no formato da API de Conversões (sem o token). Valor = parte paga correspondente aos produtos selecionados. */
export function buildPurchaseEvent(order: EventOrder, eventId: string, selected: Set<string>) {
  const items = order.items.filter((i) => selected.has(i.productId));
  const itemsTotal = items.reduce((s, i) => s + i.totalCents, 0);
  const paidCents = order.subtotalCents > 0 ? Math.round((itemsTotal * order.totalCents) / order.subtotalCents) : order.totalCents;
  const ctx = order.trackingContext ?? order.parentOrder?.trackingContext ?? null;
  const base = staticAppBaseUrl().url;
  const sourceUrl = ctx?.sourceUrl ?? (base && order.checkout?.slug ? `${base}/checkout/${order.checkout.slug}` : undefined);
  const email = order.customer.email?.trim().toLowerCase();
  const phone = normPhone(order.customer.phone);
  const userData: Record<string, unknown> = { external_id: [sha256(order.customerId)] };
  if (email) userData.em = [sha256(email)];
  if (phone) userData.ph = [sha256(phone)];
  if (ctx?.userAgent) userData.client_user_agent = ctx.userAgent;
  if (ctx?.fbc) userData.fbc = ctx.fbc;
  return {
    event_name: "Purchase",
    event_time: Math.floor((order.approvedAt ?? order.updatedAt).getTime() / 1000),
    event_id: eventId,
    action_source: "website",
    ...(sourceUrl ? { event_source_url: sourceUrl } : {}),
    user_data: userData,
    custom_data: {
      currency: order.currency,
      value: Math.round(paidCents) / 100,
      content_ids: [...new Set(items.map((i) => i.productId))],
      content_name: [...new Set(items.map((i) => i.product.name))].join(", ").slice(0, 200),
      content_type: "product",
      num_items: items.reduce((s, i) => s + i.quantity, 0),
      order_id: order.code,
    },
  };
}

type Fetch = typeof fetch;
export interface OutboxResult {
  created: number;
  sent: number;
  failed: number;
  skipped: number;
}

async function finish(ev: MetaEvent, data: Prisma.MetaEventUpdateInput) {
  await prisma.metaEvent.update({ where: { id: ev.id }, data: { ...data, lockedUntil: null } });
}

async function sendOne(ev: MetaEvent & { metaPixel: MetaPixel & { products: { productId: string }[] } }, now: Date, fetchFn: Fetch): Promise<"sent" | "failed" | "retry" | "skipped"> {
  const px = ev.metaPixel;
  // a configuração atual é respeitada no momento do envio
  if (!px.enabled) return finish(ev, { status: "SKIPPED", lastError: "Integração desativada antes do envio." }).then(() => "skipped");
  const selected = new Set(px.products.map((p) => p.productId));
  const order = await prisma.order.findUnique({
    where: { id: ev.orderId },
    include: { customer: true, items: { include: { product: { select: { id: true, name: true } } } }, trackingContext: true, parentOrder: { include: { trackingContext: true } }, checkout: { select: { slug: true } } },
  });
  if (!order || order.ownerId !== px.ownerId || order.isDemo || order.status !== "APPROVED") return finish(ev, { status: "SKIPPED", lastError: "A encomenda já não está paga ou não pertence a esta conta." }).then(() => "skipped");
  if (!order.items.some((i) => selected.has(i.productId))) return finish(ev, { status: "SKIPPED", lastError: "Produto deixou de estar selecionado." }).then(() => "skipped");
  if (order.approvedAt && now.getTime() - order.approvedAt.getTime() > MAX_AGE_MS) return finish(ev, { status: "FAILED", lastError: "Compra com mais de 7 dias: a Meta já não aceita o evento." }).then(() => "failed");
  const token = decryptSecret(px.tokenEnc);
  if (!token) {
    await prisma.metaPixel.update({ where: { id: px.id }, data: { lastError: "Não foi possível ler o token guardado. Introduza-o de novo." } });
    return finish(ev, { status: "FAILED", lastError: "Token indisponível no servidor." }).then(() => "failed");
  }

  const body = { data: [buildPurchaseEvent(order, ev.eventId, selected)], access_token: token, ...(order.isTestPayment && px.testEventCode ? { test_event_code: px.testEventCode } : {}) };
  let res: Response | null = null;
  let netError: string | null = null;
  try {
    res = await fetchFn(`${GRAPH}/${META_API_VERSION}/${encodeURIComponent(px.pixelId)}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    netError = scrub(e instanceof Error ? e.message : "erro de rede", token);
  }
  const attempts = ev.attempts + 1;
  if (res?.ok) {
    const j = (await res.json().catch(() => ({}))) as { events_received?: number; fbtrace_id?: string };
    await finish(ev, { status: "SENT", attempts, sentAt: now, lastError: null, eventsReceived: j.events_received ?? null, fbtraceId: j.fbtrace_id?.slice(0, 100) ?? null });
    await prisma.metaPixel.update({ where: { id: px.id }, data: { lastSentAt: now, lastError: null } });
    return "sent";
  }
  let message = netError ?? `Resposta ${res?.status ?? "?"} da Meta`;
  let permanent = false;
  if (res) {
    const j = (await res.json().catch(() => null)) as { error?: { message?: string; code?: number } } | null;
    if (j?.error?.message) message = scrub(`${j.error.message}${j.error.code ? ` (código ${j.error.code})` : ""}`, token);
    // pedidos inválidos/token inválido não melhoram com novas tentativas; limites e erros do servidor sim
    permanent = res.status >= 400 && res.status < 500 && res.status !== 429;
  }
  if (permanent || attempts >= MAX_ATTEMPTS) {
    await finish(ev, { status: "FAILED", attempts, lastError: message });
    await prisma.metaPixel.update({ where: { id: px.id }, data: { lastError: message } });
    await prisma.integrationLog.create({ data: { ownerId: px.ownerId, provider: "meta", level: "error", message: `Evento Purchase não enviado ao Pixel ${px.pixelId}: ${message}` } });
    return "failed";
  }
  await finish(ev, { attempts, lastError: message, nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60_000) });
  return "retry";
}

/** Cria os eventos em falta e envia os pendentes (com reivindicação: dois processos nunca enviam o mesmo evento). */
export async function processMetaOutbox(limit = 25, opts: { now?: Date; fetch?: Fetch } = {}): Promise<OutboxResult> {
  const now = opts.now ?? new Date();
  const fetchFn = opts.fetch ?? fetch;
  const created = await syncMetaPurchases(now);
  const due = await prisma.metaEvent.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now }, OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
    orderBy: { createdAt: "asc" },
    take: limit,
    include: { metaPixel: { include: { products: { select: { productId: true } } } } },
  });
  const out: OutboxResult = { created, sent: 0, failed: 0, skipped: 0 };
  for (const ev of due) {
    const claim = await prisma.metaEvent.updateMany({
      where: { id: ev.id, status: "PENDING", OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }] },
      data: { lockedUntil: new Date(now.getTime() + LOCK_MS) },
    });
    if (claim.count !== 1) continue;
    try {
      const r = await sendOne(ev, now, fetchFn);
      if (r === "sent") out.sent++;
      else if (r === "failed") out.failed++;
      else if (r === "skipped") out.skipped++;
    } catch (e) {
      console.error("[meta] envio", e instanceof Error ? e.message : "erro");
      await prisma.metaEvent.update({ where: { id: ev.id }, data: { lockedUntil: null } }).catch(() => undefined);
    }
  }
  return out;
}

/** Depois de uma venda: envia em segundo plano sem atrasar a resposta (a rotina periódica volta a tentar). */
export async function scheduleMetaDispatch(): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(async () => {
      await processMetaOutbox(25).catch((e) => console.error("[meta] fila", e instanceof Error ? e.message : "erro"));
    });
  } catch {
    // sem contexto de pedido (ex.: testes): a rotina periódica trata
  }
}

export { DomainError };
