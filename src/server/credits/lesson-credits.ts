// Lesson credits granted when the teacher cancels a lesson or blocks a day (RN-011).
import { and, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { credit } from "@/db/schema";
import { lessonCreditExpiresAt } from "./rules";

export type LessonCreditOrigin = "teacher_cancellation" | "schedule_block";

/**
 * Gives one lesson credit per student for a cancelled lesson. Idempotent: a
 * student never gets two credits for the same lesson. Returns the students
 * who received a new credit.
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
  },
): Promise<string[]> {
  if (input.recipients.length === 0) return [];
  const existing = await db
    .select({ studentId: credit.studentId })
    .from(credit)
    .where(and(eq(credit.sourceLessonId, input.lessonId), eq(credit.kind, "lesson")));
  const already = new Set(existing.map((c) => c.studentId));
  const fresh = input.recipients.filter((r) => !already.has(r.studentId));
  if (fresh.length === 0) return [];

  const expiresAt = lessonCreditExpiresAt({ now: input.now, lessonStartsAt: input.lessonStartsAt });
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
  return fresh.map((r) => r.studentId);
}

/** Cancels the open credits of a participation that ended (RN-027). */
export async function removeEnrollmentCredits(db: Database, enrollmentIds: string[]): Promise<void> {
  if (enrollmentIds.length === 0) return;
  await db
    .update(credit)
    .set({ status: "removed" })
    .where(and(inArray(credit.enrollmentId, enrollmentIds), inArray(credit.status, ["available", "reserved"])));
}
