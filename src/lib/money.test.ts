import { describe, expect, it } from "vitest";
import { formatBRL, roundToWholeReais } from "./money";

describe("roundToWholeReais", () => {
  it("rounds half up to the next real (RN-025 example)", () => {
    expect(roundToWholeReais(8450)).toBe(8500);
  });
  it("rounds down below half", () => {
    expect(roundToWholeReais(4225)).toBe(4200);
  });
});

describe("formatBRL", () => {
  it("formats cents as reais", () => {
    expect(formatBRL(16900).replace(/\s/g, " ")).toBe("R$ 169,00");
  });
});
