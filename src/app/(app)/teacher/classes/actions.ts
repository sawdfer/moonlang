"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { db } from "@/db";
import { recordAudit } from "@/server/audit";
import { requireStaff } from "@/server/auth/session";
import {
  agendaOwnerId,
  classGroupSchema, dateField, errorState, formatIssues, notifyStudents, parseForm } from "@/server/classes/form";
import type { FormState } from "@/server/classes/form-state";
import {
  createClassGroup,
  endClassGroup,
  enrollStudent,
  getClassGroupDetail,
  removeEnrollment,
  updateClassGroup,
} from "@/server/classes/groups";
import { checkWeeklySlot } from "@/server/classes/lessons";
import { getSetting } from "@/server/settings";

const idField = z.string().min(1);

export async function createClassGroupAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = parseForm(classGroupSchema, formData);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { force, ...input } = parsed.data;
  const now = new Date();
  const teacherId = await agendaOwnerId(staff);

  // RN-003: warn about conflicts and only go ahead after a manual confirmation.
  const issues = await checkWeeklySlot(db, {
    ...input,
    teacherId,
    endsOn: null,
    maxLessonsPerDay: await getSetting("maxLessonsPerDay"),
    now,
  });
  if (issues.length > 0 && !force) return { issues: await formatIssues(issues) };

  const id = await createClassGroup(db, { ...input, teacherId, now });
  revalidatePath("/teacher", "layout");
  redirect(`/teacher/classes/${id}`);
}

export async function updateClassGroupAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = parseForm(classGroupSchema.extend({ id: idField }), formData);
  if (parsed.error !== undefined) return { error: parsed.error };
  const { force, id, ...input } = parsed.data;
  const now = new Date();

  const current = await getClassGroupDetail(db, id);
  if (!current) return { error: "notFound" };
  const { group } = current;
  const slotChanged =
    input.weekday !== group.weekday ||
    input.startTime !== group.startTime.slice(0, 5) ||
    input.durationMinutes !== group.durationMinutes ||
    input.startsOn !== group.startsOn;
  if (slotChanged && !force) {
    const issues = await checkWeeklySlot(db, {
      ...input,
      teacherId: group.teacherId,
      endsOn: group.endsOn,
      excludeGroupId: id,
      maxLessonsPerDay: await getSetting("maxLessonsPerDay"),
      now,
    });
    if (issues.length > 0) return { issues: await formatIssues(issues) };
  }

  try {
    const result = await updateClassGroup(db, { ...input, id, now });
    if (result.planChanged) {
      await recordAudit({
        actorId: staff.id,
        action: "class_group.change_duration",
        entityType: "class_group",
        entityId: id,
        data: { from: group.durationMinutes, to: input.durationMinutes, students: result.studentIds },
      });
    }
    if (result.scheduleChanged) {
      const t = await getTranslations("classes.notifications");
      await notifyStudents(result.studentIds, {
        type: "class_schedule_changed",
        title: t("scheduleChangedTitle"),
        body: [
          t("scheduleChangedBody", { name: input.name }),
          result.planChanged ? t("planChangedBody", { hours: input.durationMinutes / 60 }) : "",
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/teacher", "layout");
  return { success: "saved" };
}

export async function endClassGroupAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const id = idField.parse(formData.get("id"));
  const detail = await getClassGroupDetail(db, id);
  if (!detail) return { error: "notFound" };
  try {
    const result = await endClassGroup(db, { id, actorId: staff.id, now: new Date() });
    await recordAudit({ actorId: staff.id, action: "class_group.end", entityType: "class_group", entityId: id });
    const t = await getTranslations("classes.notifications");
    await notifyStudents(result.studentIds, {
      type: "class_group_ended",
      title: t("groupEndedTitle"),
      body: t("groupEndedBody", { name: detail.group.name }),
    });
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/teacher", "layout");
  return { success: "ended" };
}

const enrollSchema = z.object({
  classGroupId: idField,
  studentId: idField,
  planId: idField,
  startedOn: dateField,
});

export async function enrollStudentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const parsed = parseForm(enrollSchema, formData);
  if (parsed.error !== undefined) return { error: parsed.error };
  const detail = await getClassGroupDetail(db, parsed.data.classGroupId);
  if (!detail) return { error: "notFound" };
  try {
    await enrollStudent(db, parsed.data);
  } catch (error) {
    return errorState(error);
  }
  await recordAudit({
    actorId: staff.id,
    action: "enrollment.create",
    entityType: "class_group",
    entityId: parsed.data.classGroupId,
    data: { studentId: parsed.data.studentId, planId: parsed.data.planId },
  });
  const t = await getTranslations("classes.notifications");
  await notifyStudents([parsed.data.studentId], {
    type: "class_group_joined",
    title: t("joinedTitle"),
    body: t("joinedBody", { name: detail.group.name }),
  });
  revalidatePath("/teacher", "layout");
  return { success: "enrolled" };
}

export async function removeEnrollmentAction(_state: FormState, formData: FormData): Promise<FormState> {
  const staff = await requireStaff();
  const enrollmentId = idField.parse(formData.get("enrollmentId"));
  try {
    const result = await removeEnrollment(db, { enrollmentId, now: new Date() });
    await recordAudit({
      actorId: staff.id,
      action: "enrollment.remove",
      entityType: "class_group",
      entityId: result.classGroupId,
      data: { studentId: result.studentId },
    });
  } catch (error) {
    return errorState(error);
  }
  revalidatePath("/teacher", "layout");
  return { success: "removed" };
}
