"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { cefrLevel, scheduleBlockKind, trialOutcome } from "@/db/schema";
import { recordAudit } from "@/server/audit";
import { requireStaff } from "@/server/auth/session";
import {
  agendaOwnerId,
  dateField,
  durationField,
  errorState,
  forceField,
  formatIssues,
  LESSON_WHEN,
  meetingUrlField,
  notifyStudents,
  parseForm,
  timeField,
} from "@/server/classes/form";
import type { FormState } from "@/server/classes/form-state";
import { getClassGroupDetail } from "@/server/classes/groups";
import {
  type CancelledLesson,
  cancelLessonByTeacher,
  checkLessonSlot,
  createOneOffLesson,
  createScheduleBlock,
  setAttendance,
  setLessonMeetingUrl,
} from "@/server/classes/lessons";
import { attendanceForArrival, zonedDateTime } from "@/server/classes/rules";
import {
  checkTrialEligibility,
  recordTrialOutcome,
  scheduleTrialLesson,
  TRIAL_DURATION_MINUTES,
} from "@/server/classes/trial";
import { getSetting } from "@/server/settings";

const idField = z.string().min(1);

const oneOffSchema = z.object({
  classGroupId: idField,
  date: dateField,
  time: timeField,
  durationMinutes: durationField,
  meetingUrl: meetingUrlField,
  force: forceField,
});

/** One-off lesson set by the teacher: confirmed right away (RN-006), warns on conflicts (RN-003). */
export async function createOneOffLessonAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = parseForm(oneOffSchema, formData);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { classGroupId, date, time, durationMinutes, meetingUrl, force } = parsed.data;
  const detail = await getClassGroupDetail(db, classGroupId);
  if (!detail) return { error: "notFound" };
  const startsAt = zonedDateTime(date, time);

  if (!force) {
    const issue = await checkLessonSlot(db, {
      teacherId: detail.group.teacherId,
      startsAt,
      durationMinutes,
      maxLessonsPerDay: await getSetting("maxLessonsPerDay"),
    });
    if (issue) return { issues: await formatIssues([issue]) };
  }

  let lessonId: string;
  try {
    lessonId = await createOneOffLesson(db, { classGroupId, startsAt, durationMinutes, meetingUrl, now: new Date() });
  } catch (error) {
    return errorState(error);
  }
  await recordAudit({ actorId: staff.id, action: "lesson.create_one_off", entityType: "lesson", entityId: lessonId });
  const t = await getTranslations("classes.notifications");
  const format = await getFormatter();
  await notifyStudents(
    detail.students.filter((s) => s.status === "active").map((s) => s.studentId),
    {
      type: "lesson_scheduled",
      title: t("lessonScheduledTitle"),
      body: t("lessonScheduledBody", { name: detail.group.name, when: format.dateTime(startsAt, LESSON_WHEN) }),
    },
  );
  revalidatePath("/teacher", "layout");
  redirect(`/teacher/agenda/lessons/${lessonId}`);
}

/**
 * One notification per student with the cancelled lessons, the credits they got
 * and, for a vacation, when their open credits expire (RN-011, V2).
 */
async function notifyCancellations(
  cancelled: CancelledLesson[],
  reason: "teacher" | "block",
  vacation?: { startsAt: Date; expiringCredits: Map<string, number> },
) {
  const t = await getTranslations("classes.notifications");
  const format = await getFormatter();
  const day = (date: Date) => format.dateTime(date, { day: "2-digit", month: "2-digit" });
  const byStudent = new Map<string, { dates: string[]; credits: number; until: Date | null }>();
  const entryFor = (studentId: string) => {
    const entry = byStudent.get(studentId) ?? { dates: [], credits: 0, until: null };
    byStudent.set(studentId, entry);
    return entry;
  };
  for (const lesson of cancelled) {
    for (const studentId of lesson.studentIds) {
      const entry = entryFor(studentId);
      entry.dates.push(format.dateTime(lesson.startsAt, LESSON_WHEN));
      if (lesson.creditedStudentIds.includes(studentId) && lesson.creditExpiresAt) {
        entry.credits += 1;
        if (!entry.until || lesson.creditExpiresAt < entry.until) entry.until = lesson.creditExpiresAt;
      }
    }
  }
  for (const studentId of vacation?.expiringCredits.keys() ?? []) entryFor(studentId);

  for (const [studentId, entry] of byStudent) {
    const expiring = vacation?.expiringCredits.get(studentId) ?? 0;
    const lines = [
      entry.dates.length > 0 ? t("cancelledBody", { dates: entry.dates.join(", ") }) : "",
      entry.credits > 0 && entry.until ? t("creditsGranted", { count: entry.credits, date: day(entry.until) }) : "",
      vacation && expiring > 0 ? t("vacationCreditsExpire", { count: expiring, date: day(vacation.startsAt) }) : "",
    ].filter(Boolean);
    await notifyStudents([studentId], {
      type: vacation ? "vacation_created" : reason === "block" ? "lesson_cancelled_block" : "lesson_cancelled",
      title: vacation ? t("vacationTitle") : t("cancelledTitle", { count: entry.dates.length }),
      body: lines.join(" "),
    });
  }
}

export async function cancelLessonAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const lessonId = idField.parse(formData.get("lessonId"));
  try {
    const result = await cancelLessonByTeacher(db, { lessonId, actorId: staff.id, now: new Date() });
    await recordAudit({
      actorId: staff.id,
      action: "lesson.cancel_by_teacher",
      entityType: "lesson",
      entityId: lessonId,
      data: { credited: result.creditedStudentIds },
    });
    await notifyCancellations([result], "teacher");
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/teacher", "layout");
  return { success: "cancelled" };
}

const attendanceSchema = z.object({
  lessonId: idField,
  studentId: idField,
  mark: z.enum(["present", "absent", "late"]),
  minutesLate: z.coerce.number().int().min(0).max(240).optional().default(0),
});

/** Per-student attendance; more than 20 minutes late is an absence (RN-008, RN-010). */
export async function setAttendanceAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = parseForm(attendanceSchema, formData);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { lessonId, studentId, mark, minutesLate } = parsed.data;
  const status = mark === "late" ? attendanceForArrival(minutesLate) : mark;
  try {
    await setAttendance(db, { lessonId, studentId, status, actorId: staff.id, now: new Date() });
  } catch (error) {
    return errorState(error);
  }
  await recordAudit({
    actorId: staff.id,
    action: "lesson.attendance",
    entityType: "lesson",
    entityId: lessonId,
    data: { studentId, status, minutesLate: mark === "late" ? minutesLate : undefined },
  });
  revalidatePath("/teacher", "layout");
  return { success: status === "late_absent" ? "lateAbsent" : "attendanceSaved" };
}

export async function setLessonMeetingUrlAction(_state: FormState, formData: FormData): Promise<FormState> {
  await requireStaff();
  const parsed = parseForm(z.object({ lessonId: idField, meetingUrl: meetingUrlField }), formData);
  if (parsed.error !== undefined) return { error: parsed.error };
  await setLessonMeetingUrl(db, parsed.data);
  revalidatePath("/teacher", "layout");
  return { success: "saved" };
}

const blockSchema = z.object({
  kind: z.enum(scheduleBlockKind.enumValues),
  startsOn: dateField,
  endsOn: dateField,
  reason: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
});

/** Blocks days: weekly lessons there are cancelled and students get lesson credits (F-004, RN-011). */
export async function createScheduleBlockAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = parseForm(blockSchema, formData);
  if (parsed.error !== undefined) return { error: parsed.error };
  let result: Awaited<ReturnType<typeof createScheduleBlock>>;
  try {
    result = await createScheduleBlock(db, {
      ...parsed.data,
      teacherId: await agendaOwnerId(staff),
      now: new Date(),
    });
  } catch (error) {
    return errorState(error);
  }
  await recordAudit({
    actorId: staff.id,
    action: "schedule_block.create",
    entityType: "schedule_block",
    entityId: result.blockId,
    data: {
      ...parsed.data,
      cancelledLessons: result.cancelled.length,
      expiredCredits: [...result.expiringCredits.values()].reduce((a, b) => a + b, 0),
    },
  });
  await notifyCancellations(
    result.cancelled,
    "block",
    parsed.data.kind === "vacation"
      ? { startsAt: zonedDateTime(parsed.data.startsOn, "00:00"), expiringCredits: result.expiringCredits }
      : undefined,
  );
  revalidatePath("/teacher", "layout");
  redirect(`/teacher/agenda/blocks?cancelled=${result.cancelled.length}`);
}

const trialSchema = z.object({
  userId: idField,
  date: dateField,
  time: timeField,
  meetingUrl: meetingUrlField.refine((v) => v !== null, { message: "invalidMeetingUrl" }),
  force: forceField,
});

/**
 * Schedules a trial lesson (F-006). Warns when the person already had a trial
 * in the last 3 months (RN-018) or the slot conflicts (RN-003); staff may confirm anyway.
 */
export async function scheduleTrialLessonAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = parseForm(trialSchema, formData);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { userId, date, time, meetingUrl, force } = parsed.data;
  const startsAt = zonedDateTime(date, time);
  const teacherId = await agendaOwnerId(staff);

  let eligibility: Awaited<ReturnType<typeof checkTrialEligibility>>;
  try {
    eligibility = await checkTrialEligibility(db, { userId, startsAt });
  } catch (error) {
    return errorState(error);
  }
  if (!force) {
    const t = await getTranslations("agenda.trial");
    const format = await getFormatter();
    const warnings: string[] = [];
    if (!eligibility.allowed && eligibility.nextAllowedOn) {
      warnings.push(
        t("tooSoon", {
          date: format.dateTime(zonedDateTime(eligibility.nextAllowedOn, "12:00"), { dateStyle: "short" }),
        }),
      );
    }
    const issue = await checkLessonSlot(db, {
      teacherId,
      startsAt,
      durationMinutes: TRIAL_DURATION_MINUTES,
      maxLessonsPerDay: await getSetting("maxLessonsPerDay"),
    });
    if (issue) warnings.push(...(await formatIssues([issue])));
    if (warnings.length > 0) return { issues: warnings };
  }

  let lessonId: string;
  try {
    lessonId = await scheduleTrialLesson(db, { userId, teacherId, startsAt, meetingUrl: meetingUrl!, now: new Date() });
  } catch (error) {
    return errorState(error);
  }
  await recordAudit({
    actorId: staff.id,
    action: eligibility.allowed ? "trial.schedule" : "trial.schedule_override",
    entityType: "lesson",
    entityId: lessonId,
    data: { userId, nextAllowedOn: eligibility.nextAllowedOn },
  });
  const t = await getTranslations("classes.notifications");
  const format = await getFormatter();
  await notifyStudents([userId], {
    type: "trial_scheduled",
    title: t("trialScheduledTitle"),
    body: t("trialScheduledBody", { when: format.dateTime(startsAt, LESSON_WHEN) }),
  });
  revalidatePath("/teacher", "layout");
  redirect(`/teacher/agenda/lessons/${lessonId}`);
}

const trialOutcomeSchema = z.object({
  lessonId: idField,
  cefrLevel: z
    .union([z.enum(cefrLevel.enumValues), z.literal("")])
    .optional()
    .transform((v) => v || null),
  outcome: z.enum(trialOutcome.enumValues),
  notes: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => v || null),
});

/** After the trial lesson: CEFR level, outcome and notes (F-006, RN-018). */
export async function recordTrialOutcomeAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = parseForm(trialOutcomeSchema, formData);
  if (parsed.error !== undefined) return { error: parsed.error };
  try {
    const { userId } = await recordTrialOutcome(db, { ...parsed.data, now: new Date() });
    await recordAudit({
      actorId: staff.id,
      action: "trial.outcome",
      entityType: "lesson",
      entityId: parsed.data.lessonId,
      data: { userId, cefrLevel: parsed.data.cefrLevel, outcome: parsed.data.outcome },
    });
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/teacher", "layout");
  return { success: "saved" };
}
