import { describe, expect, it } from "vitest";
import { parseDayList, parseReaisToCents } from "./form";

describe("parseReaisToCents", () => {
  it("reads amounts typed in reais", () => {
    expect(parseReaisToCents("85")).toBe(8500);
    expect(parseReaisToCents("84,50")).toBe(8450);
    expect(parseReaisToCents("84.5")).toBe(8450);
    expect(parseReaisToCents("R$ 1.234,56")).toBe(123456);
    expect(parseReaisToCents("1.234")).toBe(123400);
  });

  it("rejects anything else", () => {
    expect(parseReaisToCents("")).toBeNull();
    expect(parseReaisToCents("-5")).toBeNull();
    expect(parseReaisToCents("abc")).toBeNull();
    expect(parseReaisToCents("1,234,5")).toBeNull();
  });
});

describe("parseDayList", () => {
  it("accepts commas and spaces", () => {
    expect(parseDayList("5, 10 15;20")).toEqual([5, 10, 15, 20]);
  });
});
