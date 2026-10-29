import "server-only";
// Inactivity notices and the admin's keep/remove decision (RN-021, RN-023).
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  account,
  classGroup,
  consent,
  contactAttempt,
  credit,
  enrollment,
  invite,
  notification,
  session,
  studentProfile,
  trialRecord,
  twoFactor,
  user,
  userPreference,
  whatsappMessage,
} from "@/db/schema";
import { toDateString } from "@/lib/dates";
import { recordAudit } from "@/server/audit";
import { peopleTranslator } from "@/server/auth/mail-text";
import { isAdmin } from "@/server/auth/roles";
import { removeEnrollment } from "@/server/classes/groups";
import { notify } from "@/server/notifications";
import { inactiveSince, isInactive, isRetentionDue, retentionDueAt } from "./situation";
import { type Actor, PeopleError } from "./students";

/** Name shown in charts and lists for a removed account: aggregated numbers stay, personal data goes. */
export const REMOVED_STUDENT_NAME = "—";

/**
 * Daily review (idempotent): tells the teacher when a student becomes inactive
 * and the admins when an inactive account is due for a decision (RN-021).
 * Safe to call often: each notice has a dedupe key.
 */
export async function runRetentionReview(now = new Date()) {
  const students = await db
    .select({
      id: user.id,
      name: user.name,
      createdAt: user.createdAt,
      lastAccessAt: studentProfile.lastAccessAt,
      keptAt: studentProfile.retentionReviewedAt,
    })
    .from(user)
    .innerJoin(studentProfile, eq(studentProfile.userId, user.id))
    .where(inArray(user.role, ["student", "trial"]));
  const inactive = students.filter((s) => isInactive(s.lastAccessAt ?? s.createdAt, now));
  if (inactive.length === 0) return { inactive: 0, retention: 0 };

  const staff = await db
    .select({ id: user.id, role: user.role })
    .from(user)
    .where(inArray(user.role, ["root", "admin", "teacher"]));
  const admins = staff.filter((s) => isAdmin(s.role)).map((s) => s.id);
  const teachers = staff.filter((s) => s.role === "teacher").map((s) => s.id);
  const groups = await db
    .select({ studentId: enrollment.studentId, teacherId: classGroup.teacherId })
    .from(enrollment)
    .innerJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .where(inArray(enrollment.studentId, inactive.map((s) => s.id)));

  const t = peopleTranslator();
  let retention = 0;
  for (const s of inactive) {
    const lastSeen = s.lastAccessAt ?? s.createdAt;
    const link = `/teacher/students/${s.id}`;
    const own = [...new Set(groups.filter((g) => g.studentId === s.id).map((g) => g.teacherId))];
    for (const teacherId of own.length ? own : teachers) {
      await notify({
        userId: teacherId,
        type: "student_inactive",
        title: t("inactiveTitle"),
        body: t("inactiveBody", { name: s.name }),
        link,
        dedupeKey: `student-inactive:${s.id}:${teacherId}:${toDateString(inactiveSince(lastSeen))}`,
      });
    }
    if (!isRetentionDue(lastSeen, s.keptAt, now)) continue;
    retention += 1;
    const due = toDateString(retentionDueAt(lastSeen, s.keptAt));
    for (const adminId of admins) {
      await notify({
        userId: adminId,
        type: "student_retention_due",
        title: t("retentionTitle"),
        body: t("retentionBody", { name: s.name }),
        link,
        sendEmail: true,
        dedupeKey: `student-retention:${s.id}:${adminId}:${due}`,
      });
    }
  }
  return { inactive: inactive.length, retention };
}

/** RN-021: the admin keeps the account; a new notice comes in 6 months. */
export async function keepStudentAccount(actor: Actor, studentId: string, now = new Date()) {
  if (!isAdmin(actor.role)) throw new PeopleError("forbidden");
  const [row] = await db
    .update(studentProfile)
    .set({ retentionReviewedAt: now })
    .where(eq(studentProfile.userId, studentId))
    .returning({ userId: studentProfile.userId });
  if (!row) throw new PeopleError("notFound");
  await recordAudit({
    actorId: actor.id,
    action: "student.retention_kept",
    entityType: "user",
    entityId: studentId,
  });
}

/**
 * Removes a student's account (RN-021 decision, or a deletion request, RN-023).
 * Only admins and root. Personal data and directly linked records are deleted;
 * the user row stays as an anonymous placeholder so aggregated lesson and
 * billing numbers keep adding up, without any personal data.
 */
export async function removeStudentAccount(
  actor: Actor,
  studentId: string,
  reason: string,
  now = new Date(),
) {
  if (!isAdmin(actor.role)) throw new PeopleError("forbidden");
  const [target] = await db
    .select({ role: user.role })
    .from(user)
    .innerJoin(studentProfile, eq(studentProfile.userId, user.id))
    .where(eq(user.id, studentId));
  if (!target || !["student", "trial"].includes(target.role)) throw new PeopleError("notFound");

  // Leaving the class groups stops new charges and cancels their credits (RN-027).
  const open = await db
    .select({ id: enrollment.id })
    .from(enrollment)
    .where(and(eq(enrollment.studentId, studentId), ne(enrollment.status, "dropped")));
  for (const e of open) await removeEnrollment(db, { enrollmentId: e.id, now });

  await db.transaction(async (tx) => {
    await tx.delete(credit).where(eq(credit.studentId, studentId));
    await tx.delete(contactAttempt).where(eq(contactAttempt.studentId, studentId));
    await tx.delete(consent).where(eq(consent.userId, studentId));
    await tx.delete(trialRecord).where(eq(trialRecord.userId, studentId));
    await tx.delete(notification).where(eq(notification.userId, studentId));
    await tx.delete(whatsappMessage).where(eq(whatsappMessage.recipientId, studentId));
    await tx.delete(userPreference).where(eq(userPreference.userId, studentId));
    await tx.delete(twoFactor).where(eq(twoFactor.userId, studentId));
    await tx.delete(session).where(eq(session.userId, studentId));
    await tx.delete(account).where(eq(account.userId, studentId));
    await tx.delete(studentProfile).where(eq(studentProfile.userId, studentId));
    await tx
      .update(invite)
      .set({ name: REMOVED_STUDENT_NAME, email: null, phoneNumber: null })
      .where(eq(invite.usedByUserId, studentId));
    await tx
      .update(user)
      .set({
        name: REMOVED_STUDENT_NAME,
        email: `removed-${studentId}@removed.invalid`,
        emailVerified: false,
        phoneNumber: null,
        phoneNumberVerified: null,
        image: null,
        twoFactorEnabled: false,
        updatedAt: now,
      })
      .where(eq(user.id, studentId));
  });

  await recordAudit({
    actorId: actor.id,
    action: "student.removed",
    entityType: "user",
    entityId: studentId,
    reason,
  });
}
