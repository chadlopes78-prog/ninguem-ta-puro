// Metas de faturamento do Dashboard (funções puras, partilhadas entre servidor e browser).
// O faturamento usado é sempre o acumulado real de pedidos APROVADOS em MZN (ver getRevenueGoalState).

export interface RevenueGoal {
  /** Valor da meta em cêntimos de MZN */
  cents: number;
  /** "primeira", "segunda", … (para "Faltam X para atingir a tua primeira meta") */
  ordinal: string;
  /** Mensagem de parabéns mostrada quando a meta é atingida pela primeira vez */
  message: string;
}

export const REVENUE_GOALS: readonly RevenueGoal[] = [
  { cents: 10_000_00, ordinal: "primeira", message: "Parabéns! Atingiste os teus primeiros 10 mil MZN em faturamento!" },
  { cents: 50_000_00, ordinal: "segunda", message: "Parabéns! Já faturaste 50 mil MZN!" },
  { cents: 100_000_00, ordinal: "terceira", message: "Incrível! Atingiste 100 mil MZN em faturamento!" },
  { cents: 500_000_00, ordinal: "quarta", message: "Fantástico! Já faturaste meio milhão de meticais!" },
  { cents: 1_000_000_00, ordinal: "quinta", message: "Parabéns! Atingiste 1 milhão de MZN em faturamento!" },
];

export interface GoalProgress {
  revenueCents: number;
  /** Próxima meta por atingir; null quando a meta máxima já foi atingida */
  next: RevenueGoal | null;
  /** Meta apresentada na barra (a próxima, ou a máxima quando concluída) */
  target: RevenueGoal;
  /** 0–100; só chega a 100 quando a meta é efetivamente atingida */
  percent: number;
  remainingCents: number;
  completed: boolean;
}

export function goalProgress(revenueCents: number): GoalProgress {
  const revenue = Math.max(0, Math.trunc(revenueCents));
  const next = REVENUE_GOALS.find((g) => revenue < g.cents) ?? null;
  if (!next) {
    const top = REVENUE_GOALS[REVENUE_GOALS.length - 1];
    return { revenueCents: revenue, next: null, target: top, percent: 100, remainingCents: 0, completed: true };
  }
  // arredonda para baixo: nunca mostra 100% antes de a meta estar atingida
  const percent = Math.min(99, Math.floor((revenue * 100) / next.cents));
  return { revenueCents: revenue, next, target: next, percent, remainingCents: next.cents - revenue, completed: false };
}

/** Metas atingidas (pelo faturamento atual) que ainda não foram celebradas, da menor para a maior. */
export function goalsToCelebrate(revenueCents: number, celebratedCents: readonly number[]): RevenueGoal[] {
  const done = new Set(celebratedCents);
  return REVENUE_GOALS.filter((g) => revenueCents >= g.cents && !done.has(g.cents));
}

/** "10.000 MZN" — valores inteiros das metas (sem casas decimais). */
export function formatGoalMzn(cents: number): string {
  const units = Math.floor(cents / 100);
  return `${units.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} MZN`;
}
