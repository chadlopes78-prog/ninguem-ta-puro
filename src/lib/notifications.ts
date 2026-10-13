// Notificações: categorias, preferências e textos partilhados entre servidor e interface.
import type { NotificationType } from "@prisma/client";

export type PreferenceKey = "sales" | "pending" | "failed" | "refunds" | "dailySummary";

export interface NotificationPrefs {
  pushEnabled: boolean;
  sales: boolean;
  pending: boolean;
  failed: boolean;
  refunds: boolean;
  dailySummary: boolean;
}

/** Valores por omissão para quem ainda não alterou as preferências (o resumo diário é opcional). */
export const DEFAULT_PREFS: NotificationPrefs = { pushEnabled: true, sales: true, pending: true, failed: true, refunds: true, dailySummary: false };

/** Categoria de preferência que controla cada tipo (o teste é sempre permitido). */
export const TYPE_PREFERENCE: Record<NotificationType, PreferenceKey | null> = {
  SALE_CONFIRMED: "sales",
  PAYMENT_PENDING: "pending",
  PAYMENT_FAILED: "failed",
  REFUND_CONFIRMED: "refunds",
  DAILY_SUMMARY: "dailySummary",
  TEST: null,
};

export const PREFERENCE_LABELS: Record<PreferenceKey, { label: string; description: string }> = {
  sales: { label: "Novas vendas", description: "Quando um pagamento é confirmado pelo gateway (EPay ou E2Payments)." },
  pending: { label: "Pagamentos pendentes", description: "Quando um pagamento é iniciado e aguarda confirmação. Não é uma venda." },
  failed: { label: "Pagamentos falhados", description: "Quando um pagamento é recusado, expira ou é cancelado." },
  refunds: { label: "Reembolsos", description: "Quando um reembolso é registado num pedido pago." },
  dailySummary: { label: "Resumo diário", description: "Todas as manhãs: vendas, faturamento e reembolsos do dia anterior." },
};

export const TYPE_LABELS: Record<NotificationType, string> = {
  SALE_CONFIRMED: "Venda confirmada",
  PAYMENT_PENDING: "Pagamento pendente",
  PAYMENT_FAILED: "Pagamento falhado",
  REFUND_CONFIRMED: "Reembolso",
  DAILY_SUMMARY: "Resumo diário",
  TEST: "Teste",
};

export function isAllowed(prefs: NotificationPrefs, type: NotificationType): boolean {
  const key = TYPE_PREFERENCE[type];
  return key === null ? true : prefs[key];
}

/** Rótulo legível do dispositivo a partir do User-Agent (apenas informativo). */
export function deviceLabelFromUserAgent(ua: string | null | undefined): string {
  const s = ua ?? "";
  const os = /iPhone/.test(s) ? "iPhone" : /iPad/.test(s) ? "iPad" : /Android/.test(s) ? "Android" : /Mac OS X|Macintosh/.test(s) ? "Mac" : /Windows/.test(s) ? "Windows" : /Linux/.test(s) ? "Linux" : "Dispositivo";
  const browser = /Edg\//.test(s) ? "Edge" : /SamsungBrowser/.test(s) ? "Samsung Internet" : /Firefox\//.test(s) ? "Firefox" : /OPR\//.test(s) ? "Opera" : /Chrome\//.test(s) ? "Chrome" : /Safari\//.test(s) ? "Safari" : "Navegador";
  return `${os} · ${browser}`;
}

/**
 * Serviços de push conhecidos (Google/FCM, Apple, Mozilla, Microsoft). O servidor só envia pedidos para estes
 * domínios — impede que uma subscrição forjada faça o servidor contactar endereços arbitrários.
 */
const PUSH_HOST_SUFFIXES = [".googleapis.com", ".push.apple.com", ".mozilla.com", ".mozaws.net", ".notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  let u: URL;
  try {
    u = new URL(endpoint);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((sfx) => host.endsWith(sfx) || host === sfx.slice(1));
}
