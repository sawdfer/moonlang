// Lesson reminders (F-008): "aula amanhã" at 18:00 the day before and "aula em 1 hora".
import { addDays } from "date-fns";
import { inAppTimeZone, toDateString } from "@/lib/dates";

export type ReminderKind = "lesson_tomorrow" | "lesson_in_one_hour";

/** Hour (São Paulo) from which the day-before reminder goes out. */
export const DAY_BEFORE_HOUR = 18;
export const ONE_HOUR_MS = 60 * 60 * 1000;

/** How far ahead the job needs to look: tomorrow ends at most ~30 h after 18:00 today. */
export const LOOKAHEAD_MS = 32 * ONE_HOUR_MS;

/**
 * Reminders due for a lesson at `now`. The job runs every few minutes, so each
 * reminder has a window instead of an exact instant; idempotency comes from the
 * dedupe key, not from this function.
 * - lesson_tomorrow: from 18:00 of the day before until midnight;
 * - lesson_in_one_hour: during the last hour before the lesson.
 */
export function dueReminders(startsAt: Date, now: Date): ReminderKind[] {
  const kinds: ReminderKind[] = [];
  if (startsAt.getTime() <= now.getTime()) return kinds;

  const nowLocal = inAppTimeZone(now);
  const tomorrow = toDateString(addDays(nowLocal, 1));
  if (nowLocal.getHours() >= DAY_BEFORE_HOUR && toDateString(startsAt) === tomorrow) {
    kinds.push("lesson_tomorrow");
  }
  if (startsAt.getTime() - now.getTime() <= ONE_HOUR_MS) {
    kinds.push("lesson_in_one_hour");
  }
  return kinds;
}

export type ReminderLesson = {
  id: string;
  startsAt: Date;
  classGroupId: string | null;
  studentId: string | null;
};

export type ReminderEnrollment = {
  classGroupId: string;
  studentId: string;
  status: "active" | "blocked" | "dropped";
  /** YYYY-MM-DD */
  startedOn: string;
};

export type ReminderAttendance = { studentId: string; status: string };

const CANCELLED_ATTENDANCE = new Set(["cancelled_in_time", "cancelled_late"]);

/**
 * Students to remind: the lesson's own student (extra, makeup, trial) plus the
 * active students of its class group. Blocked students cannot join the lesson
 * (RN-024), and students who cancelled their spot are skipped.
 */
export function reminderRecipients(
  lesson: ReminderLesson,
  enrollments: ReminderEnrollment[],
  attendances: ReminderAttendance[],
): string[] {
  const lessonDate = toDateString(lesson.startsAt);
  const recipients = new Set<string>();
  if (lesson.studentId) recipients.add(lesson.studentId);
  if (lesson.classGroupId) {
    for (const e of enrollments) {
      if (e.classGroupId === lesson.classGroupId && e.status === "active" && e.startedOn <= lessonDate) {
        recipients.add(e.studentId);
      }
    }
  }
  for (const a of attendances) {
    if (CANCELLED_ATTENDANCE.has(a.status)) recipients.delete(a.studentId);
  }
  return [...recipients];
}

/** Page of the lesson inside the platform; reminders never carry the meeting link (RN-024). */
export function lessonPagePath(lessonId: string): string {
  return `/student/lessons/${encodeURIComponent(lessonId)}`;
}

export function reminderDedupeKey(kind: ReminderKind, lessonId: string, userId: string): string {
  return `${kind}:${lessonId}:${userId}`;
}
