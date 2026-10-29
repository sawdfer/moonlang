import { describe, expect, it } from "vitest";
import {
  canChangeDueDay,
  dueDayChangeAllowedFrom,
  inactiveSince,
  isRetentionDue,
  matchesFilter,
  retentionDueAt,
  shouldTouchLastAccess,
  studentSituation,
} from "./situation";

const d = (iso: string) => new Date(iso);

describe("inactivity", () => {
  it("RN-021: inactive 30 days after the last access (doc example)", () => {
    expect(inactiveSince(d("2027-02-01T12:00:00Z")).toISOString()).toBe("2027-03-03T12:00:00.000Z");
  });

  it("RN-021: the admin is notified 1 year after the account became inactive (doc example)", () => {
    const lastSeen = d("2027-02-01T12:00:00Z");
    expect(retentionDueAt(lastSeen, null).toISOString()).toBe("2028-03-03T12:00:00.000Z");
    expect(isRetentionDue(lastSeen, null, d("2028-03-02T12:00:00Z"))).toBe(false);
    expect(isRetentionDue(lastSeen, null, d("2028-03-03T12:00:00Z"))).toBe(true);
  });

  it("RN-021: a kept account is notified again every 6 months", () => {
    const lastSeen = d("2027-02-01T12:00:00Z");
    const kept = d("2028-03-04T12:00:00Z");
    expect(retentionDueAt(lastSeen, kept).toISOString()).toBe("2028-09-04T12:00:00.000Z");
  });

  it("RN-021: signing in again starts a new period, older decisions no longer count", () => {
    const kept = d("2028-03-04T12:00:00Z");
    const lastSeen = d("2028-05-01T12:00:00Z");
    expect(retentionDueAt(lastSeen, kept).toISOString()).toBe("2029-05-31T12:00:00.000Z");
  });

  it("writes the last access at most once per hour", () => {
    const now = d("2026-11-10T15:00:00Z");
    expect(shouldTouchLastAccess(null, now)).toBe(true);
    expect(shouldTouchLastAccess(d("2026-11-10T14:30:00Z"), now)).toBe(false);
    expect(shouldTouchLastAccess(d("2026-11-10T14:00:00Z"), now)).toBe(true);
  });
});

describe("studentSituation", () => {
  const now = d("2026-11-10T15:00:00Z");
  const recent = d("2026-11-09T15:00:00Z");
  const old = d("2026-09-01T15:00:00Z");

  it("RN-018: trial users are listed as trial", () => {
    expect(studentSituation({ role: "trial", enrollments: [], lastSeen: recent, now }).status).toBe("trial");
  });

  it("RN-015: any blocked participation makes the student blocked", () => {
    expect(
      studentSituation({ role: "student", enrollments: ["active", "blocked"], lastSeen: recent, now }).status,
    ).toBe("blocked");
  });

  it("RN-027: a student who left every class group is dropped", () => {
    expect(
      studentSituation({ role: "student", enrollments: ["dropped", "dropped"], lastSeen: recent, now }).status,
    ).toBe("dropped");
    expect(
      studentSituation({ role: "student", enrollments: ["dropped", "active"], lastSeen: recent, now }).status,
    ).toBe("active");
  });

  it("RN-021: inactivity is a flag on top of the status", () => {
    const s = studentSituation({ role: "student", enrollments: ["blocked"], lastSeen: old, now });
    expect(s).toEqual({ status: "blocked", inactive: true });
    expect(matchesFilter(s, "inactive")).toBe(true);
    expect(matchesFilter(s, "blocked")).toBe(true);
    expect(matchesFilter(s, "active")).toBe(false);
  });

  it("F-002: 'active' excludes inactive students", () => {
    const s = studentSituation({ role: "student", enrollments: ["active"], lastSeen: old, now });
    expect(matchesFilter(s, "active")).toBe(false);
    expect(matchesFilter({ status: "active", inactive: false }, "active")).toBe(true);
  });
});

describe("due day", () => {
  it("RN-025: can change again 3 months after the last change (doc example)", () => {
    const changedAt = d("2026-11-21T15:00:00Z");
    expect(dueDayChangeAllowedFrom(changedAt)?.toISOString()).toBe("2027-02-21T15:00:00.000Z");
    expect(canChangeDueDay({ changedAt, now: d("2027-02-20T15:00:00Z"), isAdmin: false })).toBe(false);
    expect(canChangeDueDay({ changedAt, now: d("2027-02-21T15:00:00Z"), isAdmin: false })).toBe(true);
  });

  it("RN-025: admins can change it any time", () => {
    const changedAt = d("2026-11-21T15:00:00Z");
    expect(canChangeDueDay({ changedAt, now: d("2026-11-22T15:00:00Z"), isAdmin: true })).toBe(true);
  });

  it("RN-025: never changed means it can change", () => {
    expect(canChangeDueDay({ changedAt: null, now: d("2026-11-22T15:00:00Z"), isAdmin: false })).toBe(true);
  });
});
