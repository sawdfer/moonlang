import { describe, expect, it } from "vitest";
import {
  addDaysToDate,
  attendanceForArrival,
  canJoinLesson,
  checkSchedule,
  isAllowedMeetingUrl,
  isBlocked,
  lessonEndsAt,
  shouldAutoComplete,
  weekdayOfDate,
  weeklyOccurrences,
  zonedDateTime,
} from "./rules";

describe("zonedDateTime", () => {
  it("RN-001: 19:00 in São Paulo is stored as 22:00 UTC", () => {
    expect(zonedDateTime("2026-11-10", "19:00")).toEqual(new Date("2026-11-10T22:00:00Z"));
  });

  it("RN-001: accepts the HH:MM:SS format of time columns", () => {
    expect(zonedDateTime("2026-11-10", "08:30:00")).toEqual(new Date("2026-11-10T11:30:00Z"));
  });
});

describe("calendar helpers", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDaysToDate("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("returns the weekday with Sunday = 0", () => {
    expect(weekdayOfDate("2026-11-01")).toBe(0);
    expect(weekdayOfDate("2026-11-03")).toBe(2);
  });
});

describe("lessonEndsAt", () => {
  it("RN-002: a 1h lesson at 19:00 takes the agenda until 20:00", () => {
    const startsAt = zonedDateTime("2026-11-10", "19:00");
    expect(lessonEndsAt({ startsAt, durationMinutes: 60 })).toEqual(zonedDateTime("2026-11-10", "20:00"));
  });

  it("RN-002: a 2h lesson at 19:00 takes the agenda until 21:00", () => {
    const startsAt = zonedDateTime("2026-11-10", "19:00");
    expect(lessonEndsAt({ startsAt, durationMinutes: 120 })).toEqual(zonedDateTime("2026-11-10", "21:00"));
  });
});

describe("weeklyOccurrences", () => {
  const tuesdays = { weekday: 2, startTime: "19:00:00", startsOn: "2026-11-01", endsOn: null };

  it("RN-004: one lesson per week on the fixed weekday and time, in São Paulo (RN-001)", () => {
    const result = weeklyOccurrences(tuesdays, {
      from: new Date("2026-11-01T03:00:00Z"),
      to: new Date("2026-11-25T03:00:00Z"),
    });
    expect(result).toEqual([
      new Date("2026-11-03T22:00:00Z"),
      new Date("2026-11-10T22:00:00Z"),
      new Date("2026-11-17T22:00:00Z"),
      new Date("2026-11-24T22:00:00Z"),
    ]);
  });

  it("starts on the group's start date, not before", () => {
    const result = weeklyOccurrences(
      { ...tuesdays, startsOn: "2026-11-11" },
      { from: new Date("2026-11-01T03:00:00Z"), to: new Date("2026-11-25T03:00:00Z") },
    );
    expect(result.map((d) => d.toISOString())).toEqual([
      "2026-11-17T22:00:00.000Z",
      "2026-11-24T22:00:00.000Z",
    ]);
  });

  it("stops at the group's end date", () => {
    const result = weeklyOccurrences(
      { ...tuesdays, endsOn: "2026-11-10" },
      { from: new Date("2026-11-01T03:00:00Z"), to: new Date("2026-12-31T03:00:00Z") },
    );
    expect(result).toHaveLength(2);
  });

  it("skips an occurrence that already started before the range", () => {
    const result = weeklyOccurrences(tuesdays, {
      from: new Date("2026-11-03T22:30:00Z"),
      to: new Date("2026-11-11T03:00:00Z"),
    });
    expect(result).toEqual([new Date("2026-11-10T22:00:00Z")]);
  });

  it("RN-001: a late-evening lesson keeps its São Paulo weekday even when UTC is the next day", () => {
    const result = weeklyOccurrences(
      { weekday: 5, startTime: "22:30", startsOn: "2026-11-01", endsOn: null },
      { from: new Date("2026-11-01T03:00:00Z"), to: new Date("2026-11-08T03:00:00Z") },
    );
    // Friday 2026-11-06 22:30 in São Paulo is Saturday 01:30 UTC.
    expect(result).toEqual([new Date("2026-11-07T01:30:00Z")]);
  });
});

describe("checkSchedule", () => {
  const existing = [
    { id: "a", startsAt: zonedDateTime("2026-11-10", "19:00"), durationMinutes: 120, status: "confirmed" as const },
  ];

  it("RN-002: a lesson inside another lesson's 2h block overlaps", () => {
    const result = checkSchedule(
      { startsAt: zonedDateTime("2026-11-10", "20:00"), durationMinutes: 60 },
      existing,
      2,
    );
    expect(result.overlapping.map((l) => l.id)).toEqual(["a"]);
    expect(result.dailyLimitReached).toBe(false);
  });

  it("RN-002: back-to-back lessons do not overlap", () => {
    const result = checkSchedule(
      { startsAt: zonedDateTime("2026-11-10", "21:00"), durationMinutes: 60 },
      existing,
      2,
    );
    expect(result.overlapping).toEqual([]);
  });

  it("RN-003: a second lesson on the same day reaches the 1-per-day limit", () => {
    const result = checkSchedule(
      { startsAt: zonedDateTime("2026-11-10", "09:00"), durationMinutes: 60 },
      existing,
      1,
    );
    expect(result.overlapping).toEqual([]);
    expect(result.dailyLimitReached).toBe(true);
  });

  it("RN-003: the limit is configurable", () => {
    const result = checkSchedule(
      { startsAt: zonedDateTime("2026-11-10", "09:00"), durationMinutes: 60 },
      existing,
      2,
    );
    expect(result.dailyLimitReached).toBe(false);
  });

  it("RN-003: counts days in São Paulo, not UTC", () => {
    // 2026-11-10 23:00 in São Paulo is 2026-11-11 02:00 UTC: still the 10th.
    const result = checkSchedule(
      { startsAt: zonedDateTime("2026-11-11", "08:00"), durationMinutes: 60 },
      [{ startsAt: zonedDateTime("2026-11-10", "23:00"), durationMinutes: 60, status: "confirmed" }],
      1,
    );
    expect(result.dailyLimitReached).toBe(false);
  });

  it("ignores cancelled and rejected lessons", () => {
    const result = checkSchedule(
      { startsAt: zonedDateTime("2026-11-10", "19:00"), durationMinutes: 60 },
      [
        { startsAt: zonedDateTime("2026-11-10", "19:00"), durationMinutes: 60, status: "cancelled_by_teacher" },
        { startsAt: zonedDateTime("2026-11-10", "19:00"), durationMinutes: 60, status: "rejected" },
      ],
      1,
    );
    expect(result.overlapping).toEqual([]);
    expect(result.dailyLimitReached).toBe(false);
  });
});

describe("isBlocked", () => {
  const blocks = [{ startsOn: "2026-12-20", endsOn: "2027-01-05" }];

  it("F-004: blocks are inclusive on both ends", () => {
    expect(isBlocked(zonedDateTime("2026-12-20", "08:00"), blocks)).toBe(true);
    expect(isBlocked(zonedDateTime("2027-01-05", "21:00"), blocks)).toBe(true);
    expect(isBlocked(zonedDateTime("2027-01-06", "08:00"), blocks)).toBe(false);
  });

  it("RN-001: uses the São Paulo date", () => {
    // 2026-12-19 22:30 in São Paulo is already the 20th in UTC.
    expect(isBlocked(zonedDateTime("2026-12-19", "22:30"), blocks)).toBe(false);
  });
});

describe("attendanceForArrival", () => {
  it("RN-010: arriving 15 minutes late is still present", () => {
    expect(attendanceForArrival(15)).toBe("present");
  });

  it("RN-010: exactly 20 minutes late is still present", () => {
    expect(attendanceForArrival(20)).toBe("present");
  });

  it("RN-008, RN-010: more than 20 minutes late is an absence", () => {
    expect(attendanceForArrival(25)).toBe("late_absent");
  });
});

describe("shouldAutoComplete", () => {
  const lesson = { startsAt: zonedDateTime("2026-11-10", "19:00"), durationMinutes: 60 };

  it("F-004: a confirmed lesson becomes done when it ends", () => {
    expect(shouldAutoComplete({ ...lesson, status: "confirmed" }, zonedDateTime("2026-11-10", "20:00"))).toBe(true);
  });

  it("F-004: not before it ends", () => {
    expect(shouldAutoComplete({ ...lesson, status: "confirmed" }, zonedDateTime("2026-11-10", "19:59"))).toBe(false);
  });

  it("F-004: a cancelled lesson stays cancelled", () => {
    expect(
      shouldAutoComplete({ ...lesson, status: "cancelled_by_teacher" }, zonedDateTime("2026-11-11", "08:00")),
    ).toBe(false);
  });
});

describe("isAllowedMeetingUrl", () => {
  it("RN-024: accepts Google Meet and Zoom links", () => {
    expect(isAllowedMeetingUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isAllowedMeetingUrl("https://us02web.zoom.us/j/123456789?pwd=x")).toBe(true);
  });

  it("RN-024: rejects other hosts and non-HTTPS links", () => {
    expect(isAllowedMeetingUrl("http://meet.google.com/abc")).toBe(false);
    expect(isAllowedMeetingUrl("https://evilzoom.us/j/1")).toBe(false);
    expect(isAllowedMeetingUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedMeetingUrl("not a url")).toBe(false);
  });
});

describe("canJoinLesson", () => {
  const now = zonedDateTime("2026-11-10", "18:00");
  const groupLesson = {
    startsAt: zonedDateTime("2026-11-10", "19:00"),
    durationMinutes: 60,
    status: "confirmed" as const,
    kind: "weekly" as const,
    classGroupId: "g1",
    studentId: null,
  };
  const student = { id: "s1", role: "student" as const };

  it("RN-024: an active enrollment sees the link", () => {
    expect(canJoinLesson({ lesson: groupLesson, viewer: student, enrollmentStatus: "active", now })).toBe(true);
  });

  it("RN-015: a blocked enrollment does not see the link", () => {
    expect(canJoinLesson({ lesson: groupLesson, viewer: student, enrollmentStatus: "blocked", now })).toBe(false);
  });

  it("RN-024: without an enrollment in the group, no link", () => {
    expect(canJoinLesson({ lesson: groupLesson, viewer: student, enrollmentStatus: null, now })).toBe(false);
    expect(canJoinLesson({ lesson: groupLesson, viewer: student, enrollmentStatus: "dropped", now })).toBe(false);
  });

  it("no link for a cancelled or finished lesson", () => {
    expect(
      canJoinLesson({
        lesson: { ...groupLesson, status: "cancelled_by_teacher" },
        viewer: student,
        enrollmentStatus: "active",
        now,
      }),
    ).toBe(false);
    expect(
      canJoinLesson({
        lesson: groupLesson,
        viewer: student,
        enrollmentStatus: "active",
        now: zonedDateTime("2026-11-10", "20:00"),
      }),
    ).toBe(false);
  });

  it("RN-018: a trial user only joins their own trial lesson", () => {
    const trial = { id: "t1", role: "trial" as const };
    const trialLesson = { ...groupLesson, kind: "trial" as const, classGroupId: null, studentId: "t1" };
    expect(canJoinLesson({ lesson: trialLesson, viewer: trial, enrollmentStatus: null, now })).toBe(true);
    expect(canJoinLesson({ lesson: groupLesson, viewer: trial, enrollmentStatus: "active", now })).toBe(false);
    expect(
      canJoinLesson({ lesson: { ...trialLesson, studentId: "other" }, viewer: trial, enrollmentStatus: null, now }),
    ).toBe(false);
  });

  it("an individual lesson is only for its own student", () => {
    const individual = { ...groupLesson, kind: "one_off" as const, classGroupId: null, studentId: "s1" };
    expect(canJoinLesson({ lesson: individual, viewer: student, enrollmentStatus: null, now })).toBe(true);
    expect(
      canJoinLesson({ lesson: individual, viewer: { id: "s2", role: "student" }, enrollmentStatus: null, now }),
    ).toBe(false);
  });
});
