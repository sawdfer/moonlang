import { describe, expect, it } from "vitest";
import { cronMatches } from "./scheduler.mjs";

const at = (iso: string) => new Date(iso);

describe("cronMatches", () => {
  it("runs billing once a day at 09:00 UTC", () => {
    expect(cronMatches("0 9 * * *", at("2026-10-30T09:00:00Z"))).toBe(true);
    expect(cronMatches("0 9 * * *", at("2026-10-30T09:01:00Z"))).toBe(false);
    expect(cronMatches("0 9 * * *", at("2026-10-30T10:00:00Z"))).toBe(false);
  });

  it("runs reminders every 10 minutes", () => {
    expect(cronMatches("*/10 * * * *", at("2026-10-30T13:20:00Z"))).toBe(true);
    expect(cronMatches("*/10 * * * *", at("2026-10-30T13:25:00Z"))).toBe(false);
  });

  it("runs maintenance at minute 5 of every hour", () => {
    expect(cronMatches("5 * * * *", at("2026-10-30T00:05:00Z"))).toBe(true);
    expect(cronMatches("5 * * * *", at("2026-10-30T00:15:00Z"))).toBe(false);
  });

  it("supports lists and ranges", () => {
    expect(cronMatches("0 9 * * 1-5", at("2026-10-30T09:00:00Z"))).toBe(true); // Friday
    expect(cronMatches("0 9 * * 1-5", at("2026-10-31T09:00:00Z"))).toBe(false); // Saturday
    expect(cronMatches("0,30 * * * *", at("2026-10-30T09:30:00Z"))).toBe(true);
  });
});
