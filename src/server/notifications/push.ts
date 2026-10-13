// Web Push (RFC 8030 + VAPID RFC 8292 + cifra aes128gcm RFC 8291) através da biblioteca `web-push`.
// Só corre no servidor: a chave privada VAPID nunca chega ao browser.
//
// Chaves VAPID:
//  1. VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY definidas no ambiente (prioridade), ou
//  2. geradas automaticamente na primeira utilização e guardadas na BD (privada cifrada com secret-box),
//     para que funcione sem configurar nada na Vercel.
// Se as chaves mudarem, as subscrições antigas deixam de ser válidas e são marcadas como revogadas.
import "server-only";
import { randomBytes } from "crypto";
import webpush from "web-push";
import { prisma } from "@/server/db";
import { decryptSecret, encryptSecret, secretStorageAvailable } from "@/server/secret-box";
import { staticAppBaseUrl } from "@/server/app-url";
import { isAllowedPushEndpoint } from "@/lib/notifications";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
  source: "env" | "database";
}

let cached: VapidKeys | null = null;

async function vapidSubject(): Promise<string> {
  const env = process.env.VAPID_SUBJECT?.trim();
  if (env && /^(mailto:|https:\/\/)/.test(env)) return env;
  const base = staticAppBaseUrl().url;
  if (base?.startsWith("https://")) return base;
  const s = await prisma.settings.findUnique({ where: { id: "default" } });
  const email = s?.supportEmail || s?.ownerEmail;
  return email ? `mailto:${email}` : "mailto:notificacoes@ninguem-ta-puro.app";
}

/** Chaves VAPID ativas (cria-as se ainda não existirem). Devolve null se não houver forma segura de as guardar. */
export async function getVapidKeys(): Promise<VapidKeys | null> {
  if (cached) return cached;
  const subject = await vapidSubject();
  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    cached = { publicKey: envPub, privateKey: envPriv, subject, source: "env" };
    return cached;
  }
  const row = await prisma.pushConfig.findUnique({ where: { id: "default" } });
  const priv = row ? decryptSecret(row.privateKeyEnc) : null;
  if (row && priv) {
    cached = { publicKey: row.publicKey, privateKey: priv, subject, source: "database" };
    return cached;
  }
  if (!secretStorageAvailable()) return null;
  // Primeira utilização (ou chave de cifra alterada): gerar um par novo
  const keys = webpush.generateVAPIDKeys();
  const enc = encryptSecret(keys.privateKey);
  if (row) {
    await prisma.$transaction([
      prisma.pushConfig.update({ where: { id: "default" }, data: { publicKey: keys.publicKey, privateKeyEnc: enc } }),
      prisma.pushSubscription.updateMany({ where: { revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "Chaves de notificação renovadas — ative de novo neste dispositivo." } }),
    ]);
  } else {
    // Duas instâncias em simultâneo: a primeira a gravar ganha; a outra lê o que ficou guardado
    await prisma.pushConfig.createMany({ data: [{ id: "default", publicKey: keys.publicKey, privateKeyEnc: enc }], skipDuplicates: true });
    const saved = await prisma.pushConfig.findUniqueOrThrow({ where: { id: "default" } });
    const savedPriv = decryptSecret(saved.privateKeyEnc);
    if (!savedPriv) return null;
    cached = { publicKey: saved.publicKey, privateKey: savedPriv, subject, source: "database" };
    return cached;
  }
  cached = { publicKey: keys.publicKey, privateKey: keys.privateKey, subject, source: "database" };
  return cached;
}

/** Apenas para testes. */
export function resetVapidCache() {
  cached = null;
}

// ───────────── Envio ─────────────

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export type SendResult = { ok: true; statusCode: number } | { ok: false; statusCode: number | null; error: string };
export type PushSender = (target: PushTarget, payload: string, opts: { ttl: number; urgency: "normal" | "high"; keys: VapidKeys }) => Promise<SendResult>;

const realSender: PushSender = async (target, payload, opts) => {
  try {
    const r = await webpush.sendNotification({ endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } }, payload, {
      vapidDetails: { subject: opts.keys.subject, publicKey: opts.keys.publicKey, privateKey: opts.keys.privateKey },
      TTL: opts.ttl,
      urgency: opts.urgency,
      timeout: 10_000,
    });
    return { ok: true, statusCode: r.statusCode };
  } catch (e) {
    const err = e as { statusCode?: number; body?: string; message?: string };
    const detail = (err.body || err.message || "erro desconhecido").toString().replace(/\s+/g, " ").slice(0, 200);
    return { ok: false, statusCode: typeof err.statusCode === "number" ? err.statusCode : null, error: detail };
  }
};

let sender: PushSender = realSender;
/** Apenas para testes: substitui o envio real por um simulado. */
export function setPushSender(s: PushSender | null) {
  sender = s ?? realSender;
}

/** Espera antes de cada nova tentativa (tentativas limitadas). */
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;

export function newReceiptToken(): string {
  return randomBytes(18).toString("base64url");
}

/**
 * Envia uma entrega da fila. Resultado guardado na BD:
 *  - 2xx → SENT (aceite pelo serviço de push; a receção no dispositivo só é confirmada pelo service worker);
 *  - 404/410 → GONE e a subscrição é revogada (o utilizador desinstalou/retirou a permissão);
 *  - 400/401/403/413 → FAILED definitivo (pedido inválido ou chaves não correspondem);
 *  - 429/5xx/erro de rede → nova tentativa mais tarde, até MAX_ATTEMPTS.
 */
export async function sendDelivery(deliveryId: string): Promise<SendResult | null> {
  const d = await prisma.pushDelivery.findUnique({ where: { id: deliveryId }, include: { subscription: true, notification: true } });
  if (!d || d.status !== "PENDING") return null;
  const sub = d.subscription;
  const now = new Date();
  if (sub.revokedAt || !isAllowedPushEndpoint(sub.endpoint)) {
    await prisma.pushDelivery.update({ where: { id: d.id }, data: { status: "GONE", lastError: "Subscrição revogada" } });
    return null;
  }
  const keys = await getVapidKeys();
  if (!keys) {
    await prisma.pushDelivery.update({ where: { id: d.id }, data: { lastError: "Chaves VAPID indisponíveis", nextAttemptAt: new Date(now.getTime() + BACKOFF_MS[0]) } });
    return null;
  }
  if (sub.vapidKey !== keys.publicKey) {
    await prisma.$transaction([
      prisma.pushDelivery.update({ where: { id: d.id }, data: { status: "GONE", lastError: "Subscrição criada com outras chaves" } }),
      prisma.pushSubscription.update({ where: { id: sub.id }, data: { revokedAt: now, revokedReason: "Chaves de notificação renovadas — ative de novo neste dispositivo." } }),
    ]);
    return null;
  }
  // Reserva a tentativa (evita envio duplicado se duas execuções processarem a fila ao mesmo tempo)
  const claimed = await prisma.pushDelivery.updateMany({
    where: { id: d.id, status: "PENDING", attempts: d.attempts },
    data: { attempts: { increment: 1 }, nextAttemptAt: new Date(now.getTime() + 120_000) },
  });
  if (claimed.count !== 1) return null;

  const n = d.notification;
  const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url ?? "/notificacoes", tag: `${n.type}:${n.eventKey}`.slice(0, 64), d: d.id, t: d.receiptToken });
  const urgency = n.type === "SALE_CONFIRMED" || n.type === "TEST" ? "high" : "normal";
  const r = await sender({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload, { ttl: n.type === "TEST" ? 600 : 24 * 3600, urgency, keys });
  const attempts = d.attempts + 1;

  if (r.ok) {
    await prisma.$transaction([
      prisma.pushDelivery.update({ where: { id: d.id }, data: { status: "SENT", sentAt: new Date(), lastStatusCode: r.statusCode, lastError: null } }),
      prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastSuccessAt: new Date(), failureCount: 0 } }),
    ]);
    return r;
  }
  const gone = r.statusCode === 404 || r.statusCode === 410;
  const permanent = r.statusCode !== null && [400, 401, 403, 413].includes(r.statusCode);
  const retry = !gone && !permanent && attempts < MAX_ATTEMPTS;
  await prisma.$transaction([
    prisma.pushDelivery.update({
      where: { id: d.id },
      data: {
        status: gone ? "GONE" : retry ? "PENDING" : "FAILED",
        lastStatusCode: r.statusCode,
        lastError: r.error,
        nextAttemptAt: retry ? new Date(Date.now() + BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)]) : undefined,
      },
    }),
    prisma.pushSubscription.update({
      where: { id: sub.id },
      data: {
        lastErrorAt: new Date(),
        lastError: `${r.statusCode ?? "rede"}: ${r.error}`.slice(0, 200),
        failureCount: { increment: 1 },
        ...(gone ? { revokedAt: new Date(), revokedReason: "O serviço de push indicou que a subscrição já não existe (permissão retirada ou app removida)." } : {}),
      },
    }),
  ]);
  return r;
}

/** Processa a fila persistente: entregas pendentes cujo momento chegou. Seguro para correr em paralelo. */
export async function processPushOutbox(limit = 25): Promise<{ processed: number; sent: number; failed: number }> {
  const due = await prisma.pushDelivery.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }, orderBy: { createdAt: "asc" }, take: limit, select: { id: true } });
  let sent = 0;
  let failed = 0;
  for (const { id } of due) {
    const r = await sendDelivery(id).catch(() => null);
    if (r?.ok) sent++;
    else if (r) failed++;
  }
  return { processed: due.length, sent, failed };
}

export async function hasDuePushDeliveries(): Promise<boolean> {
  return (await prisma.pushDelivery.count({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } } })) > 0;
}

/**
 * Agenda o processamento da fila para depois da resposta (Vercel: waitUntil via `after`).
 * Fora de um pedido HTTP (scripts/testes) não faz nada: a fila persiste e é processada pelo cron
 * ou na próxima abertura do painel — nenhum evento se perde.
 */
export async function schedulePushDispatch(): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(async () => {
      await processPushOutbox(25).catch((e) => console.error("[push] fila", e));
    });
  } catch {
    // sem contexto de pedido
  }
}
