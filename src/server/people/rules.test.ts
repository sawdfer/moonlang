import { describe, expect, it } from "vitest";
import {
  ageOn,
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteStatus,
  isAdult,
  needsConsent,
} from "./rules";

describe("invites", () => {
  const now = new Date("2026-11-10T15:00:00Z");

  it("RN-020: an invite is valid for 7 days", () => {
    expect(inviteExpiresAt(now).toISOString()).toBe("2026-11-17T15:00:00.000Z");
  });

  it("RN-020: valid before expiry, expired at the exact expiry instant", () => {
    const invite = { expiresAt: inviteExpiresAt(now), usedAt: null };
    expect(inviteStatus(invite, new Date("2026-11-17T14:59:59Z"))).toBe("valid");
    expect(inviteStatus(invite, new Date("2026-11-17T15:00:00Z"))).toBe("expired");
  });

  it("RN-020: a used invite cannot be used again, even before it expires", () => {
    const invite = { expiresAt: inviteExpiresAt(now), usedAt: now };
    expect(inviteStatus(invite, now)).toBe("used");
  });

  it("RN-020: tokens are random and only a stable hash is stored", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashInviteToken(a)).toBe(hashInviteToken(a));
    expect(hashInviteToken(a)).not.toContain(a);
    expect(hashInviteToken(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("age", () => {
  it("RN-019: turns 18 on the birthday itself", () => {
    expect(isAdult("2008-11-10", "2026-11-10")).toBe(true);
    expect(isAdult("2008-11-11", "2026-11-10")).toBe(false);
  });

  it("RN-019: blocks anyone under 18", () => {
    expect(isAdult("2010-01-01", "2026-11-10")).toBe(false);
    expect(isAdult("1990-05-20", "2026-11-10")).toBe(true);
  });

  it("RN-019: born on 29 Feb turns a year older on 1 Mar in non-leap years", () => {
    expect(ageOn("2008-02-29", "2026-02-28")).toBe(17);
    expect(ageOn("2008-02-29", "2026-03-01")).toBe(18);
  });
});

describe("consent", () => {
  it("RN-023: students and trial users must accept the terms", () => {
    expect(needsConsent("student", null, "v2")).toBe(true);
    expect(needsConsent("trial", null, "v2")).toBe(true);
  });

  it("RN-023: an outdated version must be accepted again", () => {
    expect(needsConsent("student", "v1", "v2")).toBe(true);
    expect(needsConsent("student", "v2", "v2")).toBe(false);
  });

  it("RN-023: staff are not asked for the student recording term", () => {
    expect(needsConsent("teacher", null, "v2")).toBe(false);
    expect(needsConsent("root", null, "v2")).toBe(false);
  });
});
