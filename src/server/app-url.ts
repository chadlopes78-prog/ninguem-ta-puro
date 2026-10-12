// Endereço público da aplicação (usado no return_url e no callback_url dos pagamentos).
// Ordem: APP_BASE_URL definida manualmente → domínio de produção fornecido automaticamente pela Vercel
// (VERCEL_PROJECT_PRODUCTION_URL) → endereço do próprio pedido (apenas na Vercel, sempre HTTPS).

export type AppUrlSource = "env" | "vercel" | "request" | null;

function clean(u: string) {
  return u.trim().replace(/\/+$/, "");
}

/** Resolução síncrona (sem pedido HTTP): variável manual ou domínio de produção da Vercel. */
export function staticAppBaseUrl(): { url: string | null; source: AppUrlSource } {
  const manual = process.env.APP_BASE_URL ?? process.env.APP_URL;
  if (manual?.trim()) return { url: clean(manual), source: "env" };
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel && /^[a-z0-9.-]+$/i.test(vercel)) return { url: `https://${vercel.toLowerCase()}`, source: "vercel" };
  return { url: null, source: null };
}

/** A aplicação está alojada na Vercel (todos os pedidos chegam por HTTPS). */
export function runningOnVercel(): boolean {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

/** Resolução no contexto de um pedido: usa o domínio pelo qual o site foi aberto, se nada estiver configurado. */
export async function resolveAppBaseUrl(): Promise<string> {
  const s = staticAppBaseUrl();
  if (s.url) return s.url;
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = (h.get("x-forwarded-host") ?? h.get("host"))?.split(",")[0]?.trim();
    if (host && /^[a-z0-9.-]+(:\d+)?$/i.test(host)) {
      const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host);
      const proto = runningOnVercel() || !isLocal ? "https" : (h.get("x-forwarded-proto") ?? "http");
      return `${proto}://${host.toLowerCase()}`;
    }
  } catch {
    // fora de um pedido (ex.: scripts) — usa o valor por omissão
  }
  return "http://localhost:3000";
}
