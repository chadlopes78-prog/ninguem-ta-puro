"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { formatMoney, type CurrencyCode } from "@/lib/money";

const AXIS = { stroke: "#6c737d", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = "#1f2328";
const ACCENT = "#c8f135";
const PREV = "#6c737d";

function shortDay(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

function compactMoney(cents: number, currency: CurrencyCode) {
  const v = cents / 100;
  const sym = currency === "BRL" ? "R$" : currency === "EUR" ? "€" : "$";
  if (Math.abs(v) >= 1000) return `${sym}${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return `${sym}${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-line-strong bg-surface-3/95 px-3 py-2 text-[12px] shadow-[var(--shadow-pop)] backdrop-blur">
      <p className="mb-1 font-medium text-fg">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-muted">
          <span className="inline-block h-0.5 w-3" style={{ background: r.dashed ? `repeating-linear-gradient(90deg, ${r.color} 0 3px, transparent 3px 5px)` : r.color }} aria-hidden="true" />
          <span>{r.label}</span>
          <span className="ml-auto pl-3 font-medium text-fg tabular">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export interface SeriesPoint {
  day: string;
  revenueCents: number;
  prevRevenueCents: number;
  orders: number;
  approved: number;
}

export function RevenueChart({ data, currency }: { data: SeriesPoint[]; currency: CurrencyCode }) {
  return (
    <div className="h-[260px] w-full sm:h-[300px]" role="img" aria-label="Gráfico de faturação por dia comparada com o período anterior">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={ACCENT} stopOpacity={0.22} />
              <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => compactMoney(v, currency)} {...AXIS} width={56} />
          <Tooltip
            cursor={{ stroke: "#3a4048", strokeWidth: 1 }}
            content={({ active, payload, label }: TooltipProps<number, string>) =>
              active && payload?.length ? (
                <TooltipBox
                  title={shortDay(String(label))}
                  rows={[
                    { label: "Faturação", value: formatMoney(Number(payload[0]?.payload.revenueCents ?? 0), currency), color: ACCENT },
                    { label: "Período anterior", value: formatMoney(Number(payload[0]?.payload.prevRevenueCents ?? 0), currency), color: PREV, dashed: true },
                  ]}
                />
              ) : null
            }
          />
          <Line type="monotone" dataKey="prevRevenueCents" stroke={PREV} strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          <Area type="monotone" dataKey="revenueCents" stroke={ACCENT} strokeWidth={2} fill="url(#rev)" dot={false} activeDot={{ r: 4, stroke: "#111316", strokeWidth: 2, fill: ACCENT }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function OrdersChart({ data }: { data: SeriesPoint[] }) {
  return (
    <div className="h-[220px] w-full" role="img" aria-label="Gráfico de número de pedidos por dia">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap={data.length > 40 ? 1 : 3}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} {...AXIS} minTickGap={24} />
          <YAxis allowDecimals={false} {...AXIS} width={40} />
          <Tooltip
            cursor={{ fill: "rgb(255 255 255 / 0.03)" }}
            content={({ active, payload, label }: TooltipProps<number, string>) =>
              active && payload?.length ? (
                <TooltipBox
                  title={shortDay(String(label))}
                  rows={[
                    { label: "Pedidos aprovados", value: String(payload[0]?.payload.approved ?? 0), color: ACCENT },
                    { label: "Total de pedidos", value: String(payload[0]?.payload.orders ?? 0), color: PREV },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="approved" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
