import { describe, expect, it } from "vitest";
import { addDays, isDayKey, resolveRange, startOfZonedDay, zonedDayKey } from "@/lib/dates";

describe("datas com fuso horário", () => {
  it("zonedDayKey respeita o fuso", () => {
    const d = new Date("2026-03-01T02:00:00Z");
    expect(zonedDayKey(d, "America/Sao_Paulo")).toBe("2026-02-28");
    expect(zonedDayKey(d, "Europe/Lisbon")).toBe("2026-03-01");
  });
  it("startOfZonedDay", () => {
    expect(startOfZonedDay("2026-03-01", "America/Sao_Paulo").toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(startOfZonedDay("2026-07-01", "Europe/Lisbon").toISOString()).toBe("2026-06-30T23:00:00.000Z");
  });
  it("isDayKey valida datas reais", () => {
    expect(isDayKey("2026-02-28")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(isDayKey("abc")).toBe(false);
  });
  it("addDays atravessa meses", () => expect(addDays("2026-01-31", 1)).toBe("2026-02-01"));
});

describe("resolveRange", () => {
  const now = new Date("2026-10-12T15:00:00Z");
  const tz = "America/Sao_Paulo";
  it("últimos 7 dias inclui hoje", () => {
    const r = resolveRange({ preset: "7d" }, tz, now);
    expect(r.days).toHaveLength(7);
    expect(r.days[6]).toBe("2026-10-12");
    expect(r.previous.to.getTime()).toBe(r.from.getTime());
  });
  it("mês anterior", () => {
    const r = resolveRange({ preset: "prevmonth" }, tz, now);
    expect(r.days[0]).toBe("2026-09-01");
    expect(r.days.at(-1)).toBe("2026-09-30");
  });
  it("este mês", () => {
    const r = resolveRange({ preset: "month" }, tz, now);
    expect(r.days[0]).toBe("2026-10-01");
    expect(r.days).toHaveLength(12);
  });
  it("personalizado válido e inválido", () => {
    const ok = resolveRange({ preset: "custom", from: "2026-01-01", to: "2026-01-10" }, tz, now);
    expect(ok.preset).toBe("custom");
    expect(ok.days).toHaveLength(10);
    const bad = resolveRange({ preset: "custom", from: "2026-02-10", to: "2026-01-01" }, tz, now);
    expect(bad.preset).toBe("30d");
  });
  it("preset desconhecido cai para 30 dias", () => {
    expect(resolveRange({ preset: "xyz" }, tz, now).days).toHaveLength(30);
  });
});
