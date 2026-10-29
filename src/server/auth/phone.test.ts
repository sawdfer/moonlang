import { describe, expect, it } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("F-001: Brazilian numbers typed in any format sign in the same way", () => {
    expect(normalizePhone("(11) 91234-5678")).toBe("+5511912345678");
    expect(normalizePhone("11912345678")).toBe("+5511912345678");
    expect(normalizePhone("011 91234 5678")).toBe("+5511912345678");
    expect(normalizePhone("55 11 91234-5678")).toBe("+5511912345678");
    expect(normalizePhone("+55 (11) 91234-5678")).toBe("+5511912345678");
  });

  it("keeps landlines and foreign numbers with a country code", () => {
    expect(normalizePhone("(11) 3123-4567")).toBe("+551131234567");
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
  });

  it("rejects what cannot be a phone number", () => {
    expect(normalizePhone("1234")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("ana@example.com")).toBeNull();
  });
});
