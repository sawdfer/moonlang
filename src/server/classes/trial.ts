import "server-only";
import { asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { lesson, studentProfile, trialRecord, user } from "@/db/schema";
import { toDateString } from "@/lib/dates";
import { ClassesError } from "./lessons";
import { nextTrialAllowedOn } from "./rules";

type CefrLevel = NonNullable<(typeof trialRecord.$inferSelect)["cefrLevel"]>;
export type TrialOutcome = (typeof trialRecord.$inferSelect)["outcome"];

/** Trial lessons always take the 1h format (RN-002, F-006). */
export const TRIAL_DURATION_MINUTES = 60;

/** People invited for a trial lesson (role "trial"). */
export async function listTrialUsers(db: Database) {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, "trial"))
    .orderBy(asc(user.name));
}

/**
 * Whether a person may take a trial lesson on a date (RN-018: one every 3
 * months). E-mail and phone number are unique per account, so the account
 * identifies the person (F-006). Cancelled trial lessons do not count.
 */
export async function checkTrialEligibility(
  db: Database,
  input: { userId: string; startsAt: Date },
): Promise<{ allowed: boolean; nextAllowedOn: string | null }> {
  const trials = await db
    .select({ createdAt: trialRecord.createdAt, startsAt: lesson.startsAt, status: lesson.status })
    .from(trialRecord)
    .leftJoin(lesson, eq(lesson.id, trialRecord.lessonId))
    .where(eq(trialRecord.userId, input.userId));
  const dates = trials
    .filter((t) => !t.status || !["cancelled_by_student", "cancelled_by_teacher", "rejected"].includes(t.status))
    .map((t) => toDateString(t.startsAt ?? t.createdAt));
  const nextAllowedOn = nextTrialAllowedOn(dates);
  return { allowed: !nextAllowedOn || toDateString(input.startsAt) >= nextAllowedOn, nextAllowedOn };
}

/** Staff schedule a trial lesson for a trial user: free, 1h, confirmed (F-006, RN-006, RN-018). */
export async function scheduleTrialLesson(
  db: Database,
  input: { userId: string; teacherId: string; startsAt: Date; meetingUrl: string; now: Date },
): Promise<string> {
  if (input.startsAt <= input.now) throw new ClassesError("pastDate");
  return db.transaction(async (tx) => {
    const [person] = await tx.select({ role: user.role }).from(user).where(eq(user.id, input.userId));
    if (person?.role !== "trial") throw new ClassesError("notATrial");
    const [row] = await tx
      .insert(lesson)
      .values({
        teacherId: input.teacherId,
        kind: "trial",
        studentId: input.userId,
        startsAt: input.startsAt,
        durationMinutes: TRIAL_DURATION_MINUTES,
        meetingUrl: input.meetingUrl,
        status: "confirmed",
      })
      .returning({ id: lesson.id });
    await tx.insert(trialRecord).values({ userId: input.userId, lessonId: row!.id });
    return row!.id;
  });
}

export async function getTrialRecord(db: Database, lessonId: string) {
  const [row] = await db.select().from(trialRecord).where(eq(trialRecord.lessonId, lessonId));
  return row ?? null;
}

/**
 * After the trial lesson, the teacher records the CEFR level, the outcome and
 * notes; the level also goes to the person's profile (RN-018, F-006).
 */
export async function recordTrialOutcome(
  db: Database,
  input: {
    lessonId: string;
    cefrLevel: CefrLevel | null;
    outcome: TrialOutcome;
    notes: string | null;
    now: Date;
  },
): Promise<{ userId: string }> {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({ startsAt: lesson.startsAt, kind: lesson.kind })
      .from(lesson)
      .where(eq(lesson.id, input.lessonId));
    if (target?.kind !== "trial") throw new ClassesError("notFound");
    if (target.startsAt > input.now) throw new ClassesError("notStarted");
    const [record] = await tx
      .update(trialRecord)
      .set({ cefrLevel: input.cefrLevel, outcome: input.outcome, notes: input.notes })
      .where(eq(trialRecord.lessonId, input.lessonId))
      .returning({ userId: trialRecord.userId });
    if (!record) throw new ClassesError("notFound");
    if (input.cefrLevel) {
      await tx
        .update(studentProfile)
        .set({ cefrLevel: input.cefrLevel })
        .where(eq(studentProfile.userId, record.userId));
    }
    return record;
  });
}
