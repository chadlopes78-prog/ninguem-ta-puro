"use client";
// Barra de progresso da meta de faturamento + celebração (uma única vez por meta e por conta).
import { useEffect, useRef, useState } from "react";
import { PartyPopper, Target, Trophy, X } from "lucide-react";
import { REVENUE_GOALS, formatGoalMzn, type GoalProgress } from "@/lib/revenue-goals";
import { cn } from "@/lib/utils";

const CONFETTI_COLORS = ["var(--color-accent)", "#60a5fa", "#f472b6", "#facc15", "#4ade80"];

export function RevenueGoal({ progress, toCelebrate, acknowledge }: { progress: GoalProgress; toCelebrate: number[]; acknowledge: (amounts: number[]) => Promise<unknown> }) {
  const goals = REVENUE_GOALS.filter((g) => toCelebrate.includes(g.cents));
  const [celebration, setCelebration] = useState(goals.length ? goals : null);
  const sent = useRef(false);

  // regista logo a celebração: recarregar a página não a repete
  useEffect(() => {
    if (!goals.length || sent.current) return;
    sent.current = true;
    void acknowledge(goals.map((g) => g.cents)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { target, percent, completed } = progress;
  const top = celebration?.[celebration.length - 1];
  const targetIndex = REVENUE_GOALS.findIndex((g) => g.cents === target.cents);

  return (
    <section aria-label="Meta de faturamento" className="relative mb-6 overflow-hidden rounded-[var(--radius-lg)] border border-line bg-surface p-5 shadow-[var(--shadow-card)]" data-testid="revenue-goal">
      {celebration && <Confetti />}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-medium text-muted">
            {completed ? <Trophy className="h-4 w-4 text-accent" aria-hidden="true" /> : <Target className="h-4 w-4 text-accent" aria-hidden="true" />}
            Meta de faturamento
          </p>
          <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-fg tabular sm:text-[28px]">
            <span data-testid="revenue-goal-revenue">{formatGoalMzn(progress.revenueCents)}</span> <span className="text-base font-medium text-muted">faturados</span>
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-[12px] uppercase tracking-[0.1em] text-subtle">{completed ? "Meta máxima" : "Meta"}</p>
          <p className="font-display text-lg font-semibold text-fg tabular" data-testid="revenue-goal-target">{formatGoalMzn(target.cents)}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-3"
          role="progressbar"
          aria-label="Progresso da meta de faturamento"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          data-testid="revenue-goal-bar"
        >
          <div className={cn("h-full rounded-full bg-accent transition-[width] duration-700 ease-out", completed && "bg-[linear-gradient(90deg,var(--color-accent),#4ade80)]")} style={{ width: `${percent}%` }} />
        </div>
        <span className="w-11 shrink-0 text-right text-sm font-semibold text-fg tabular" data-testid="revenue-goal-percent">{percent}%</span>
      </div>

      <p className="mt-3 text-[13px] text-muted" data-testid="revenue-goal-remaining">
        {completed
          ? "Atingiste a meta máxima atual de 1.000.000 MZN. Continua a vender!"
          : `Faltam ${formatGoalMzn(progress.remainingCents)} para atingir a tua ${REVENUE_GOALS[targetIndex].ordinal} meta.`}
      </p>

      {celebration && top && (
        <div role="status" className="relative mt-4 flex items-start gap-3 rounded-[var(--radius-md)] border border-accent/40 bg-accent-soft p-3 animate-slide-up" data-testid="revenue-goal-celebration">
          <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg">{top.message}</p>
            {celebration.length > 1 && (
              <p className="mt-0.5 text-[12.5px] text-muted">Metas alcançadas: {celebration.map((g) => formatGoalMzn(g.cents)).join(" · ")}</p>
            )}
          </div>
          <button type="button" onClick={() => setCelebration(null)} className="-m-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" aria-label="Fechar mensagem" data-testid="revenue-goal-celebration-close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}

/** Confetti discreto (CSS), desativado para quem prefere menos movimento. */
function Confetti() {
  const pieces = Array.from({ length: 18 }, (_, i) => {
    const angle = (i / 18) * Math.PI * 2;
    const dist = 60 + (i % 3) * 30;
    return {
      left: `${10 + ((i * 37) % 80)}%`,
      dx: `${Math.round(Math.cos(angle) * dist)}px`,
      dy: `${Math.round(Math.sin(angle) * dist + 40)}px`,
      rot: `${(i * 47) % 360}deg`,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      delay: `${(i % 6) * 60}ms`,
    };
  });
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-6 h-0 motion-reduce:hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute h-2 w-1.5 rounded-[1px] opacity-0"
          style={{ left: p.left, background: p.color, animation: `goal-confetti 1.6s ease-out ${p.delay} forwards`, ["--dx" as string]: p.dx, ["--dy" as string]: p.dy, ["--rot" as string]: p.rot }}
        />
      ))}
    </div>
  );
}
