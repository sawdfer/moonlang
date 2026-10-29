import "server-only";
import { asc, eq } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { cefrLevel, lessonType, user } from "@/db/schema";
import type { CurrentUser } from "@/server/auth/session";
import { notify } from "@/server/notifications";
import type { FormState } from "./form-state";
import { ClassesError, type ScheduleIssue } from "./lessons";
import { isAllowedMeetingUrl, isDateString } from "./rules";

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

export const meetingUrlField = optionalText.refine((v) => v === null || isAllowedMeetingUrl(v), {
  message: "invalidMeetingUrl",
});
export const dateField = z.string().refine(isDateString, { message: "invalid" });
export const timeField = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "invalid" });
export const durationField = z.coerce
  .number()
  .refine((v) => v === 60 || v === 120, { message: "invalid" });
export const forceField = z
  .string()
  .optional()
  .transform((v) => v === "1");

/** Fields of the class group form (F-003). */
export const classGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  lessonType: z.enum(lessonType.enumValues),
  cefrLevel: z
    .union([z.enum(cefrLevel.enumValues), z.literal("")])
    .optional()
    .transform((v) => v || null),
  durationMinutes: durationField,
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: timeField,
  meetingUrl: meetingUrlField,
  startsOn: dateField,
  force: forceField,
});

/** Short date and time of a lesson, e.g. "ter., 10/11, 19:00". */
export const LESSON_WHEN = {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
} as const;

/** Parses a form, returning the first error as a message key. */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
): { data: z.infer<S>; error?: undefined } | { data?: undefined; error: string } {
  const result = schema.safeParse(Object.fromEntries(formData));
  if (result.success) return { data: result.data };
  const message = result.error.issues[0]?.message;
  return { error: message === "invalidMeetingUrl" ? message : "invalid" };
}

/** Turns a known business error into form state; anything else is rethrown. */
export function errorState(error: unknown): FormState {
  if (error instanceof ClassesError) return { error: error.code };
  throw error;
}

/** Schedule warnings as readable lines (RN-002, RN-003). */
export async function formatIssues(issues: ScheduleIssue[]): Promise<string[]> {
  const t = await getTranslations("classes.issues");
  const format = await getFormatter();
  const lines = issues.slice(0, 6).map((issue) => {
    const reasons = [
      issue.overlapping && t("overlapping"),
      issue.dailyLimitReached && t("dailyLimit"),
      issue.blocked && t("blocked"),
    ].filter(Boolean);
    const when = format.dateTime(issue.startsAt, LESSON_WHEN);
    return `${when}: ${reasons.join(", ")}`;
  });
  if (issues.length > 6) lines.push(t("more", { count: issues.length - 6 }));
  return lines;
}

/** In-app notification to each student. Never includes the meeting link (RN-024). */
export async function notifyStudents(
  studentIds: Iterable<string>,
  message: { type: string; title: string; body: string },
): Promise<void> {
  for (const userId of new Set(studentIds)) {
    await notify({ userId, ...message, link: "/student" });
  }
}

/**
 * Whose agenda a staff action applies to. The teacher acts on her own agenda;
 * an admin or root acts on the teacher's agenda when there is a single
 * teacher (today, Luana), otherwise on their own.
 */
export async function agendaOwnerId(staff: CurrentUser): Promise<string> {
  if (staff.role === "teacher") return staff.id;
  const teachers = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "teacher"))
    .orderBy(asc(user.createdAt))
    .limit(2);
  return teachers.length === 1 ? teachers[0]!.id : staff.id;
}
