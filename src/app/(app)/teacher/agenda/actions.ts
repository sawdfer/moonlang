"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
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

async function notifyCancellations(cancelled: CancelledLesson[], reason: "teacher" | "block") {
  const t = await getTranslations("classes.notifications");
  const format = await getFormatter();
  const byStudent = new Map<string, { dates: string[]; credits: number }>();
  for (const lesson of cancelled) {
    for (const studentId of lesson.studentIds) {
      const entry = byStudent.get(studentId) ?? { dates: [], credits: 0 };
      entry.dates.push(format.dateTime(lesson.startsAt, LESSON_WHEN));
      if (lesson.creditedStudentIds.includes(studentId)) entry.credits += 1;
      byStudent.set(studentId, entry);
    }
  }
  for (const [studentId, entry] of byStudent) {
    await notifyStudents([studentId], {
      type: reason === "block" ? "lesson_cancelled_block" : "lesson_cancelled",
      title: t("cancelledTitle", { count: entry.dates.length }),
      body: [
        t("cancelledBody", { dates: entry.dates.join(", ") }),
        entry.credits > 0 ? t("creditsGranted", { count: entry.credits }) : "",
      ]
        .filter(Boolean)
        .join(" "),
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
    data: { ...parsed.data, cancelledLessons: result.cancelled.length },
  });
  await notifyCancellations(result.cancelled, "block");
  revalidatePath("/teacher", "layout");
  redirect(`/teacher/agenda/blocks?cancelled=${result.cancelled.length}`);
}
