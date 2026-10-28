import { describe, expect, it } from "vitest";
import { toDateString } from "./dates";

describe("toDateString", () => {
  it("RN-001: uses the São Paulo calendar date, not UTC", () => {
    // 2026-11-21 01:30 UTC is still 2026-11-20 22:30 in São Paulo.
    expect(toDateString(new Date("2026-11-21T01:30:00Z"))).toBe("2026-11-20");
  });
});
