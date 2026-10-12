// Intervalos de datas calculados no fuso horário do negócio (Settings.timezone).

export const RANGE_PRESETS = ["today", "7d", "30d", "90d", "month", "prevmonth", "custom"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
  "90d": "Últimos 90 dias",
  month: "Este mês",
  prevmonth: "Mês anterior",
  custom: "Personalizado",
};

export interface DateRange {
  preset: RangePreset;
  /** inclusivo */
  from: Date;
  /** exclusivo */
  to: Date;
  /** chaves de dia YYYY-MM-DD no fuso do negócio */
  days: string[];
  previous: { from: Date; to: Date };
  label: string;
}

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(s: string | undefined | null): s is string {
  if (!s || !DAY_KEY_RE.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "YYYY-MM-DD" do instante `date` no fuso `tz`. */
export function zonedDayKey(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function tzOffsetMs(instant: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return asUtc - Math.floor(instant / 1000) * 1000;
}

/** Instante UTC correspondente às 00:00 do dia `dayKey` no fuso `tz`. */
export function startOfZonedDay(dayKey: string, tz: string): Date {
  const [y, m, d] = dayKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let result = guess - tzOffsetMs(guess, tz);
  // segunda passagem para corrigir mudanças de hora (DST)
  result = guess - tzOffsetMs(result, tz);
  return new Date(result);
}

export function addDays(dayKey: string, n: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

function listDays(fromKey: string, toKeyInclusive: string): string[] {
  const out: string[] = [];
  for (let k = fromKey; k <= toKeyInclusive; k = addDays(k, 1)) out.push(k);
  return out;
}

const MAX_CUSTOM_DAYS = 366;

export function resolveRange(
  input: { preset?: string | null; from?: string | null; to?: string | null },
  tz: string,
  now: Date = new Date(),
): DateRange {
  const today = zonedDayKey(now, tz);
  let preset: RangePreset = (RANGE_PRESETS as readonly string[]).includes(input.preset ?? "")
    ? (input.preset as RangePreset)
    : "30d";
  let fromKey: string;
  let toKey: string; // inclusivo

  switch (preset) {
    case "today":
      fromKey = toKey = today;
      break;
    case "7d":
      fromKey = addDays(today, -6);
      toKey = today;
      break;
    case "90d":
      fromKey = addDays(today, -89);
      toKey = today;
      break;
    case "month":
      fromKey = `${today.slice(0, 7)}-01`;
      toKey = today;
      break;
    case "prevmonth": {
      const firstThis = `${today.slice(0, 7)}-01`;
      toKey = addDays(firstThis, -1);
      fromKey = `${toKey.slice(0, 7)}-01`;
      break;
    }
    case "custom":
      if (isDayKey(input.from) && isDayKey(input.to) && input.from <= input.to) {
        fromKey = input.from;
        toKey = input.to;
        if (diffDays(fromKey, toKey) >= MAX_CUSTOM_DAYS) fromKey = addDays(toKey, -(MAX_CUSTOM_DAYS - 1));
        break;
      }
      preset = "30d";
      fromKey = addDays(today, -29);
      toKey = today;
      break;
    case "30d":
    default:
      fromKey = addDays(today, -29);
      toKey = today;
  }

  const length = diffDays(fromKey, toKey) + 1;
  const prevToKey = addDays(fromKey, -1);
  const prevFromKey = addDays(prevToKey, -(length - 1));

  return {
    preset,
    from: startOfZonedDay(fromKey, tz),
    to: startOfZonedDay(addDays(toKey, 1), tz),
    days: listDays(fromKey, toKey),
    previous: { from: startOfZonedDay(prevFromKey, tz), to: startOfZonedDay(fromKey, tz) },
    label: preset === "custom" ? `${fromKey} → ${toKey}` : RANGE_LABELS[preset],
  };
}
