// Lesson credits granted when the teacher cancels a lesson or blocks a day (RN-011).
import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import { classGroup, credit, enrollment } from "@/db/schema";
import { lessonCreditExpiresAt } from "./rules";

const OPEN_STATUSES = ["available", "reserved"] as const;

export type LessonCreditOrigin = "teacher_cancellation" | "schedule_block";

/**
 * Gives one lesson credit per student for a cancelled lesson. Idempotent: a
 * student never gets two credits for the same lesson. Returns the students
 * who received a new credit and its expiry.
 */
export async function grantLessonCredits(
  db: Database,
  input: {
    lessonId: string;
    lessonStartsAt: Date;
    recipients: { studentId: string; enrollmentId: string | null }[];
    origin: LessonCreditOrigin;
    grantedById: string;
    now: Date;
    /** Start instants of the teacher's vacations: credits expire when one starts (V2). */
    vacationStarts?: readonly Date[];
  },
): Promise<{ studentIds: string[]; expiresAt: Date | null }> {
  if (input.recipients.length === 0) return { studentIds: [], expiresAt: null };
  const existing = await db
    .select({ studentId: credit.studentId })
    .from(credit)
    .where(and(eq(credit.sourceLessonId, input.lessonId), eq(credit.kind, "lesson")));
  const already = new Set(existing.map((c) => c.studentId));
  const fresh = input.recipients.filter((r) => !already.has(r.studentId));
  if (fresh.length === 0) return { studentIds: [], expiresAt: null };

  const expiresAt = lessonCreditExpiresAt({
    now: input.now,
    lessonStartsAt: input.lessonStartsAt,
    vacationStarts: input.vacationStarts,
  });
  await db.insert(credit).values(
    fresh.map((r) => ({
      studentId: r.studentId,
      enrollmentId: r.enrollmentId,
      kind: "lesson" as const,
      origin: input.origin,
      sourceLessonId: input.lessonId,
      grantedById: input.grantedById,
      expiresAt,
    })),
  );
  return { studentIds: fresh.map((r) => r.studentId), expiresAt };
}

/** Cancels the open credits of a participation that ended (RN-027). */
export async function removeEnrollmentCredits(db: Database, enrollmentIds: string[]): Promise<void> {
  if (enrollmentIds.length === 0) return;
  await db
    .update(credit)
    .set({ status: "removed" })
    .where(and(inArray(credit.enrollmentId, enrollmentIds), inArray(credit.status, [...OPEN_STATUSES])));
}

/**
 * A vacation makes every open credit of the teacher's students expire when it
 * starts, of any kind and even before its 30 days (RN-011, V2). Credits with no
 * participation (e.g. birthday) count too. Returns, per student, how many
 * credits now expire at the vacation start.
 */
export async function expireCreditsForVacation(
  db: Database,
  input: { teacherId: string; vacationStartsAt: Date; now: Date },
): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: credit.id, studentId: credit.studentId })
    .from(credit)
    .leftJoin(enrollment, eq(enrollment.id, credit.enrollmentId))
    .leftJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .where(
      and(
        inArray(credit.status, [...OPEN_STATUSES]),
        gt(credit.expiresAt, input.vacationStartsAt),
        or(isNull(credit.enrollmentId), eq(classGroup.teacherId, input.teacherId)),
      ),
    );
  if (rows.length === 0) return new Map();
  const started = input.vacationStartsAt <= input.now;
  await db
    .update(credit)
    .set(started ? { expiresAt: input.vacationStartsAt, status: "expired" } : { expiresAt: input.vacationStartsAt })
    .where(
      inArray(
        credit.id,
        rows.map((r) => r.id),
      ),
    );
  const perStudent = new Map<string, number>();
  for (const r of rows) perStudent.set(r.studentId, (perStudent.get(r.studentId) ?? 0) + 1);
  return perStudent;
}

/** Available credits past their expiry become "expired" (RN-009, RN-011). */
export async function expireDueCredits(db: Database, now: Date): Promise<void> {
  await db
    .update(credit)
    .set({ status: "expired" })
    .where(and(eq(credit.status, "available"), lte(credit.expiresAt, now)));
}
