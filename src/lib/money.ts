// Estratégia monetária: valores sempre em unidades menores inteiras (cêntimos).
// Nunca usar ponto flutuante para guardar ou somar dinheiro.

// Todas as moedas existentes na base de dados (compatibilidade com registos antigos).
export const CURRENCIES = ["MZN", "BRL", "EUR", "USD"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

/** Moedas aceites em novos preços, cupões e pagamentos. A plataforma opera em metical moçambicano. */
export const ACTIVE_CURRENCIES = ["MZN"] as const satisfies readonly CurrencyCode[];
export const DEFAULT_CURRENCY: CurrencyCode = "MZN";

export const CURRENCY_LABELS: Record<CurrencyCode, string> = {
  MZN: "Metical moçambicano (MZN)",
  BRL: "Real (BRL)",
  EUR: "Euro (EUR)",
  USD: "Dólar (USD)",
};

const LOCALE_BY_CURRENCY: Record<CurrencyCode, string> = {
  MZN: "pt-MZ",
  BRL: "pt-BR",
  EUR: "pt-PT",
  USD: "en-US",
};

export function formatMoney(cents: number, currency: CurrencyCode, locale?: string): string {
  return new Intl.NumberFormat(locale ?? LOCALE_BY_CURRENCY[currency], {
    style: "currency",
    currency,
    // MZN é apresentado com o código ISO ("1 234,50 MZN") para não haver ambiguidade
    currencyDisplay: currency === "MZN" ? "code" : "symbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/**
 * Converte texto introduzido pelo utilizador ("197", "197,00", "1.234,56", "1,234.56") em cêntimos.
 * Devolve null quando o valor é inválido. Não usa aritmética de vírgula flutuante no resultado.
 */
export function parseMoneyToCents(input: string | number): number | null {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  let s = input.trim().replace(/\s|\u00a0|\u202f|[R$€]|US\$|BRL|EUR|USD|MZN|MTn|MT/g, "");
  if (!s) return null;
  if (s.startsWith("-")) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let decimalSep: "," | "." | null = null;
  if (lastComma >= 0 && lastDot >= 0) decimalSep = lastComma > lastDot ? "," : ".";
  else if (lastComma >= 0) decimalSep = s.length - lastComma - 1 <= 2 ? "," : null;
  else if (lastDot >= 0) decimalSep = s.length - lastDot - 1 <= 2 ? "." : null;

  let intPart = s;
  let fracPart = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  intPart = intPart.replace(/[.,]/g, "");
  if (!/^\d*$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;
  if (!intPart && !fracPart) return null;
  s = `${intPart || "0"}${fracPart.padEnd(2, "0")}`;
  const cents = Number.parseInt(s, 10);
  if (!Number.isSafeInteger(cents)) return null;
  return cents;
}

/** Formata cêntimos para edição num input ("197,00"). */
export function centsToInput(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Percentagem de um valor em cêntimos, com arredondamento half-up para o cêntimo. */
export function percentOf(cents: number, percent: number): number {
  return Math.floor((cents * percent + 50) / 100);
}

export function sumCents(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0);
}
