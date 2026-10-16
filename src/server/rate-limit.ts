// Limitador simples em memória (por instância). Suficiente para uma instância única;
// para múltiplas instâncias substituir por armazenamento partilhado (ex.: Redis).
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
    }
    return true;
  }
  if (b.count >= limit) return false;
  b.count++;
  return true;
}

/**
 * Limites para compradores. Em Moçambique as operadoras móveis usam CGNAT: centenas de clientes reais podem
 * partilhar o MESMO IP público. Por isso os limites dos fluxos de compra são por comprador/percurso (proteção contra
 * abuso) com um teto por IP alto (só trava rajadas automáticas), nunca um limite baixo partilhado por todo o IP.
 */
export const BUYER_IP_CEILING = 3000;
/** Consulta do estado do pagamento: cada comprador à espera consulta a cada 4–10 s (já limitada por encomenda). */
export const STATUS_IP_CEILING = 30000;

/** Verifica sem consumir: verdadeiro se a chave já atingiu o limite na janela atual. */
export function isLimited(key: string, limit: number, now = Date.now()): boolean {
  const b = buckets.get(key);
  return Boolean(b && b.resetAt > now && b.count >= limit);
}

/** Regista uma ocorrência (ex.: tentativa falhada) sem bloquear. */
export function hit(key: string, windowMs: number, now = Date.now()): void {
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) buckets.set(key, { count: 1, resetAt: now + windowMs });
  else b.count++;
}
