import { describe, expect, it } from "vitest";
import { centsToInput, formatMoney, parseMoneyToCents, percentOf } from "@/lib/money";

describe("parseMoneyToCents", () => {
  it.each([
    ["197", 19700],
    ["197,00", 19700],
    ["197.5", 19750],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["0,01", 1],
    ["R$ 47,90", 4790],
    ["12.450,00", 1245000],
  ])("%s → %d", (input, expected) => expect(parseMoneyToCents(input)).toBe(expected));

  it.each(["", "abc", "-5", "1,2,3,4.5.6x", "12,345"])("rejeita/interpreta corretamente %s", (input) => {
    const r = parseMoneyToCents(input);
    if (input === "12,345") expect(r).toBe(1234500); // separador de milhares
    else expect(r).toBeNull();
  });

  it("não sofre de erros de vírgula flutuante", () => {
    expect(parseMoneyToCents("0,29")).toBe(29);
    expect(parseMoneyToCents("1,15")).toBe(115);
    expect(parseMoneyToCents("4.35")).toBe(435);
  });
});

describe("metical moçambicano (MZN)", () => {
  it("formata com o código MZN", () => {
    expect(formatMoney(1245000, "MZN").replace(/\s/g, " ")).toBe("12 450,00 MZN");
    expect(formatMoney(4700, "MZN").replace(/\s/g, " ")).toBe("47,00 MZN");
  });
  it("interpreta valores escritos com MZN/MT", () => {
    expect(parseMoneyToCents("1 234,50 MZN")).toBe(123450);
    expect(parseMoneyToCents("97,00 MT")).toBe(9700);
    expect(parseMoneyToCents("12\u202f450,00\u00a0MTn")).toBe(1245000);
  });
});

describe("formatação e cálculo", () => {
  it("formata em BRL e EUR", () => {
    expect(formatMoney(19700, "BRL").replace(/\s/g, " ")).toBe("R$ 197,00");
    expect(formatMoney(4700, "EUR")).toContain("47,00");
  });
  it("centsToInput", () => {
    expect(centsToInput(19705)).toBe("197,05");
    expect(centsToInput(5)).toBe("0,05");
  });
  it("percentOf arredonda half-up ao cêntimo", () => {
    expect(percentOf(19700, 10)).toBe(1970);
    expect(percentOf(1999, 10)).toBe(200); // 199,9 → 200
    expect(percentOf(1994, 10)).toBe(199); // 199,4 → 199
    expect(percentOf(1, 50)).toBe(1); // 0,5 → 1
  });
});
