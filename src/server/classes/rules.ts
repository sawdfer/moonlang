// Pure scheduling rules for class groups and lessons (F-003, F-004).
// No database and no clock here: callers pass `now` in.
import { TZDate } from "@date-fns/tz";
import { addMinutes } from "date-fns";
import type { enrollmentStatus, lessonKind, lessonStatus } from "@/db/schema";
import { APP_TIME_ZONE, toDateString } from "@/lib/dates";

export type LessonStatus = (typeof lessonStatus.enumValues)[number];
export type LessonKind = (typeof lessonKind.enumValues)[number];
export type EnrollmentStatus = (typeof enrollmentStatus.enumValues)[number];

/** A lesson takes a 1h or 2h block on the agenda (RN-002). */
export const LESSON_DURATIONS = [60, 120] as const;
/** A class group has 1 to 3 students (RN-004). */
export const MAX_STUDENTS_PER_GROUP = 3;
/** The teacher waits up to 20 minutes; after that it is an absence (RN-010). */
export const LATE_TOLERANCE_MINUTES = 20;
/** How far ahead weekly lessons are materialized. */
export const MATERIALIZE_HORIZON_DAYS = 56;

/** Statuses that occupy the agenda; cancelled and rejected lessons free the slot. */
export const BUSY_STATUSES: readonly LessonStatus[] = ["pending", "confirmed", "done"];

export type TimeSlot = { startsAt: Date; durationMinutes: number };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})(?::\d{2})?$/;

function parseDate(value: string): [number, number, number] {
  const match = DATE_RE.exec(value);
  if (!match) throw new Error(`Invalid date: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function parseTime(value: string): [number, number] {
  const match = TIME_RE.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  return [Number(match[1]), Number(match[2])];
}

export function isDateString(value: string): boolean {
  return DATE_RE.test(value);
}

/** The instant of a São Paulo wall-clock date and time (RN-001). */
export function zonedDateTime(date: string, time: string): Date {
  const [y, m, d] = parseDate(date);
  const [h, min] = parseTime(time);
  return new Date(new TZDate(y, m - 1, d, h, min, APP_TIME_ZONE).getTime());
}

/** Calendar arithmetic on YYYY-MM-DD strings, independent of any time zone. */
export function addDaysToDate(date: string, days: number): string {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOfDate(date: string): number {
  const [y, m, d] = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** "HH:MM" of an instant in São Paulo. */
export function toTimeString(date: Date): string {
  const d = new TZDate(date.getTime(), APP_TIME_ZONE);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function lessonEndsAt(slot: TimeSlot): Date {
  return addMinutes(slot.startsAt, slot.durationMinutes);
}

export type WeeklySchedule = {
  /** 0 = Sunday … 6 = Saturday, in America/Sao_Paulo. */
  weekday: number;
  /** "HH:MM" or "HH:MM:SS", São Paulo wall clock. */
  startTime: string;
  startsOn: string;
  endsOn: string | null;
};

/**
 * Start instants of a class group's weekly lessons within [from, to)
 * (RN-001, RN-004: one lesson per week, same weekday and time).
 */
export function weeklyOccurrences(
  schedule: WeeklySchedule,
  range: { from: Date; to: Date },
): Date[] {
  const fromDay = toDateString(range.from);
  let day = schedule.startsOn > fromDay ? schedule.startsOn : fromDay;
  day = addDaysToDate(day, (schedule.weekday - weekdayOfDate(day) + 7) % 7);

  const occurrences: Date[] = [];
  for (;;) {
    if (schedule.endsOn && day > schedule.endsOn) break;
    const startsAt = zonedDateTime(day, schedule.startTime);
    if (startsAt >= range.to) break;
    if (startsAt >= range.from) occurrences.push(startsAt);
    day = addDaysToDate(day, 7);
  }
  return occurrences;
}

export function overlaps(a: TimeSlot, b: TimeSlot): boolean {
  return a.startsAt < lessonEndsAt(b) && b.startsAt < lessonEndsAt(a);
}

export type ScheduleCheck<T> = {
  /** Lessons whose time overlaps the candidate. */
  overlapping: T[];
  /** The candidate's day already has `maxLessonsPerDay` lessons (RN-003). */
  dailyLimitReached: boolean;
};

/**
 * Checks a candidate lesson against the teacher's other lessons (RN-002, RN-003).
 * Cancelled and rejected lessons are ignored.
 */
export function checkSchedule<T extends TimeSlot & { status?: LessonStatus }>(
  candidate: TimeSlot,
  existing: readonly T[],
  maxLessonsPerDay: number,
): ScheduleCheck<T> {
  const busy = existing.filter((l) => !l.status || BUSY_STATUSES.includes(l.status));
  const day = toDateString(candidate.startsAt);
  const sameDay = busy.filter((l) => toDateString(l.startsAt) === day);
  return {
    overlapping: busy.filter((l) => overlaps(candidate, l)),
    dailyLimitReached: sameDay.length >= maxLessonsPerDay,
  };
}

export function hasScheduleIssue(check: ScheduleCheck<unknown>): boolean {
  return check.overlapping.length > 0 || check.dailyLimitReached;
}

export type DateRange = { startsOn: string; endsOn: string };

/** Whether a lesson falls on a blocked day (vacation, holiday), inclusive (F-004). */
export function isBlocked(startsAt: Date, blocks: readonly DateRange[]): boolean {
  const day = toDateString(startsAt);
  return blocks.some((b) => b.startsOn <= day && day <= b.endsOn);
}

/** Arriving more than 20 minutes late counts as an absence (RN-008, RN-010). */
export function attendanceForArrival(minutesLate: number): "present" | "late_absent" {
  return minutesLate > LATE_TOLERANCE_MINUTES ? "late_absent" : "present";
}

/** A confirmed lesson becomes "done" once it ends (F-004). */
export function shouldAutoComplete(
  lesson: TimeSlot & { status: LessonStatus },
  now: Date,
): boolean {
  return lesson.status === "confirmed" && lessonEndsAt(lesson) <= now;
}

/** Meeting links must be Google Meet or Zoom over HTTPS (RN-024). */
export function isAllowedMeetingUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return host === "meet.google.com" || host === "zoom.us" || host.endsWith(".zoom.us");
}

/**
 * Whether a student may see the meeting link of a lesson (RN-015, RN-018, RN-024):
 * only for a confirmed lesson that has not ended, and
 * - a trial user only for their own trial lesson;
 * - a class group lesson only with an active (not blocked or dropped) enrollment;
 * - an individual lesson only for its own student.
 */
export function canJoinLesson(input: {
  lesson: TimeSlot & {
    status: LessonStatus;
    kind: LessonKind;
    classGroupId: string | null;
    studentId: string | null;
  };
  viewer: { id: string; role: "student" | "trial" };
  enrollmentStatus: EnrollmentStatus | null;
  now: Date;
}): boolean {
  const { lesson, viewer, enrollmentStatus, now } = input;
  if (lesson.status !== "confirmed" || lessonEndsAt(lesson) <= now) return false;
  if (viewer.role === "trial") {
    return lesson.kind === "trial" && lesson.studentId === viewer.id;
  }
  if (lesson.studentId && lesson.studentId !== viewer.id) return false;
  if (lesson.classGroupId) return enrollmentStatus === "active";
  return lesson.studentId === viewer.id;
}
