// Identidade BARÃO: textos das notificações (venda aprovada, manhã, noite e resumo semanal) e rotação.
// Funções puras: sem acesso à base de dados. Os valores vêm sempre de dados reais calculados no servidor;
// nunca há nomes de produtos nem dados de clientes.
import type { CurrencyCode } from "@/lib/money";

/** Valor em destaque: «1 250,00 MT» para meticais; outras moedas com o símbolo habitual. */
export function baraoAmount(cents: number, currency: CurrencyCode): string {
  if (currency === "MZN") {
    const n = new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: "always" }).format(cents / 100);
    return `${n.replace(/[  ]/g, " ")} MT`;
  }
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency, minimumFractionDigits: 2 }).format(cents / 100);
}

/** Número estável (0…2^31) a partir de um texto — escolhe a variação sem guardar estado. */
function seed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/** Dia (contado desde 1970) de uma data «AAAA-MM-DD»: dias seguidos dão índices seguidos. */
export function dayNumber(day: string): number {
  return Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
}

/**
 * Rotação sem repetições próximas: cada conta percorre a lista inteira antes de repetir uma mensagem
 * (dias seguidos → mensagens seguidas, começando num ponto próprio de cada conta).
 */
export function rotate<T>(list: readonly T[], step: number, userId: string): T {
  return list[(((step + (seed(userId) % list.length)) % list.length) + list.length) % list.length];
}

// ───────────── Venda aprovada ─────────────

export const SALE_TITLE = "👑 Venda aprovada!";

const SALE_MESSAGES = [
  (v: string) => `Parabéns, Barão! Acabaste de receber uma venda de ${v}. 💰`,
  (v: string) => `Mais uma conquista, Barão! Venda aprovada de ${v}.`,
  (v: string) => `O teu negócio continua a movimentar dinheiro. Venda aprovada: ${v}.`,
  (v: string) => `Excelente, Barão! Mais ${v} conquistados.`,
  (v: string) => `O teu império não para! Acabaste de realizar uma venda de ${v}.`,
] as const;

/** `n`: quantas vendas aprovadas a conta já recebeu (a mensagem muda a cada venda). */
export function saleMessage(amount: string, n: number, userId: string, isTest = false): { title: string; body: string } {
  const body = rotate(SALE_MESSAGES, n, userId)(amount);
  return { title: SALE_TITLE, body: isTest ? `${body}\nPagamento de teste — não conta como receita.` : body };
}

// ───────────── Manhã ─────────────

export const MORNING_TITLE = "☀️ Bom dia, Barão!";

const MORNING_MESSAGES = [
  "Um novo dia, novas oportunidades para expandir o teu império.",
  "Barão, os grandes resultados começam com grandes decisões.",
  "Levanta-te com ambição. O teu próximo grande resultado pode começar hoje.",
  "Que hoje seja mais um capítulo de sucesso na tua história.",
  "Disciplina hoje, liberdade amanhã. O dia é teu, Barão.",
  "Cada venda começa com uma decisão. Que hoje sejam muitas.",
  "O mercado já acordou. Mostra-lhe do que és capaz, Barão.",
] as const;

const MORNING_PROFIT = [
  (v: string) => `Bom dia, Barão! O teu lucro desta semana já alcançou ${v}. Continua imparável!`,
  (v: string) => `Esta semana já conquistaste ${v}. Hoje é dia de ir mais longe.`,
] as const;

// ───────────── Noite ─────────────

export const EVENING_TITLE = "🌙 Boa noite, Barão!";

const EVENING_MESSAGES = [
  "Os grandes impérios são construídos todos os dias. Descansa, Barão.",
  "Mais um dia de oportunidades e conquistas. Amanhã há mais.",
  "O sucesso é uma construção diária. Continua a tua jornada, Barão.",
  "Descansa, Barão. O teu próximo capítulo de sucesso começa amanhã.",
  "Quem constrói com consistência colhe com abundância. Até amanhã, Barão.",
  "Hoje foi mais um tijolo no teu império. Recarrega as energias.",
] as const;

const EVENING_PROFIT = [
  (v: string) => `Fechas o dia com ${v} de lucro esta semana. Descansa, Barão — amanhã há mais.`,
  (v: string) => `${v} conquistados esta semana. O teu império cresce enquanto descansas.`,
] as const;

/** O lucro semanal aparece de vez em quando (1 em cada 3 dias), nunca quando é zero. */
function withProfit(step: number, userId: string, profitCents: number) {
  return profitCents > 0 && (step + (seed(userId) % 3)) % 3 === 0;
}

/** Este dia/período mostra o lucro semanal? (evita calcular o lucro quando a mensagem não o usa) */
export function showsProfit(kind: "morning" | "evening", day: string, userId: string): boolean {
  return withProfit(dayNumber(day) + (kind === "evening" ? 1 : 0), userId, 1);
}

export function morningMessage(day: string, userId: string, weekProfit: { cents: number; currency: CurrencyCode } | null): { title: string; body: string } {
  const step = dayNumber(day);
  if (weekProfit && withProfit(step, userId, weekProfit.cents)) {
    return { title: MORNING_TITLE, body: rotate(MORNING_PROFIT, Math.floor(step / 3), userId)(baraoAmount(weekProfit.cents, weekProfit.currency)) };
  }
  return { title: MORNING_TITLE, body: rotate(MORNING_MESSAGES, step, userId) };
}

export function eveningMessage(day: string, userId: string, weekProfit: { cents: number; currency: CurrencyCode } | null): { title: string; body: string } {
  const step = dayNumber(day) + 1; // desfasada da manhã: o lucro não aparece duas vezes no mesmo dia
  if (weekProfit && withProfit(step, userId, weekProfit.cents)) {
    return { title: EVENING_TITLE, body: rotate(EVENING_PROFIT, Math.floor(step / 3), userId)(baraoAmount(weekProfit.cents, weekProfit.currency)) };
  }
  return { title: EVENING_TITLE, body: rotate(EVENING_MESSAGES, step, userId) };
}

// ───────────── Resumo semanal ─────────────

export const WEEKLY_TITLE = "👑 Barão, olha o teu resultado!";
export const WEEKLY_TITLE_NO_PROFIT = "👑 Uma nova semana espera por ti, Barão";

const WEEKLY_MESSAGES = [
  (v: string) => `Esta semana conquistaste ${v} de lucro. Continua a construir o teu império!`,
  (v: string) => `Barão, o teu trabalho está a dar resultados. Lucro semanal: ${v}.`,
  (v: string) => `Uma semana de conquistas! Geraste ${v} de lucro. Continua a crescer!`,
  (v: string) => `Os resultados falam por ti, Barão. ${v} conquistados esta semana.`,
] as const;

const WEEKLY_NO_PROFIT = [
  "Esta semana ainda não trouxe vendas confirmadas. Os grandes impérios também começam assim — a próxima pode ser a tua.",
  "Semana nova, página em branco. Ajusta a estratégia e volta mais forte, Barão.",
  "Nenhuma venda confirmada esta semana. A persistência é o que separa os Barões dos restantes.",
] as const;

/** `week`: segunda-feira da semana («AAAA-MM-DD»). Sem lucro real, mensagem motivacional sem valores. */
export function weeklyMessage(week: string, userId: string, profit: { cents: number; currency: CurrencyCode }): { title: string; body: string } {
  const step = Math.floor(dayNumber(week) / 7);
  if (profit.cents > 0) return { title: WEEKLY_TITLE, body: rotate(WEEKLY_MESSAGES, step, userId)(baraoAmount(profit.cents, profit.currency)) };
  return { title: WEEKLY_TITLE_NO_PROFIT, body: rotate(WEEKLY_NO_PROFIT, step, userId) };
}
