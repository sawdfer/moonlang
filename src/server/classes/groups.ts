import "server-only";
import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { classGroup, enrollment, lesson, plan, user } from "@/db/schema";
import { toDateString } from "@/lib/dates";
import { removeEnrollmentCredits } from "@/server/credits/lesson-credits";
import { ClassesError, materializeWeeklyLessons } from "./lessons";
import { MAX_STUDENTS_PER_GROUP } from "./rules";

export type ClassGroupInput = {
  name: string;
  lessonType: (typeof classGroup.$inferInsert)["lessonType"];
  cefrLevel: (typeof classGroup.$inferInsert)["cefrLevel"];
  durationMinutes: number;
  weekday: number;
  startTime: string;
  meetingUrl: string | null;
  startsOn: string;
};

/** Creates a class group and its upcoming weekly lessons (F-003). */
export async function createClassGroup(
  db: Database,
  input: ClassGroupInput & { teacherId: string; now: Date },
): Promise<string> {
  const [row] = await db
    .insert(classGroup)
    .values({
      teacherId: input.teacherId,
      name: input.name,
      lessonType: input.lessonType,
      cefrLevel: input.cefrLevel,
      durationMinutes: input.durationMinutes,
      weekday: input.weekday,
      startTime: input.startTime,
      meetingUrl: input.meetingUrl,
      startsOn: input.startsOn,
    })
    .returning({ id: classGroup.id });
  await materializeWeeklyLessons(db, input.now, { groupIds: [row!.id] });
  return row!.id;
}

const seatTaking = ne(enrollment.status, "dropped");

/**
 * Edits a class group (F-003). A new weekday, time, duration or start date
 * replaces the future weekly lessons and keeps the past ones. The duration
 * cannot change while students are enrolled, because their plans follow it (RN-004).
 */
export async function updateClassGroup(
  db: Database,
  input: ClassGroupInput & { id: string; now: Date },
): Promise<{ scheduleChanged: boolean; studentIds: string[] }> {
  return db.transaction(async (tx) => {
    const [group] = await tx.select().from(classGroup).where(eq(classGroup.id, input.id)).for("update");
    if (!group) throw new ClassesError("notFound");
    if (group.endsOn) throw new ClassesError("groupEnded");
    const enrolled = await tx
      .select({ studentId: enrollment.studentId })
      .from(enrollment)
      .where(and(eq(enrollment.classGroupId, group.id), seatTaking));
    if (input.durationMinutes !== group.durationMinutes && enrolled.length > 0) {
      throw new ClassesError("durationLocked");
    }

    const scheduleChanged =
      input.weekday !== group.weekday ||
      input.startTime.slice(0, 5) !== group.startTime.slice(0, 5) ||
      input.durationMinutes !== group.durationMinutes ||
      input.startsOn !== group.startsOn;

    await tx
      .update(classGroup)
      .set({
        name: input.name,
        lessonType: input.lessonType,
        cefrLevel: input.cefrLevel,
        durationMinutes: input.durationMinutes,
        weekday: input.weekday,
        startTime: input.startTime,
        meetingUrl: input.meetingUrl,
        startsOn: input.startsOn,
      })
      .where(eq(classGroup.id, group.id));

    if (scheduleChanged) {
      await tx
        .delete(lesson)
        .where(
          and(
            eq(lesson.classGroupId, group.id),
            eq(lesson.kind, "weekly"),
            inArray(lesson.status, ["pending", "confirmed"]),
            gt(lesson.startsAt, input.now),
          ),
        );
      await materializeWeeklyLessons(tx, input.now, { groupIds: [group.id] });
    }
    return { scheduleChanged, studentIds: enrolled.map((e) => e.studentId) };
  });
}

/**
 * Ends a class group (F-003): future lessons are cancelled, the participations
 * end (no more monthly charges) and the history is kept.
 */
export async function endClassGroup(
  db: Database,
  input: { id: string; actorId: string; now: Date },
): Promise<{ studentIds: string[] }> {
  return db.transaction(async (tx) => {
    const [group] = await tx.select().from(classGroup).where(eq(classGroup.id, input.id)).for("update");
    if (!group) throw new ClassesError("notFound");
    if (group.endsOn) throw new ClassesError("groupEnded");

    await tx.update(classGroup).set({ endsOn: toDateString(input.now) }).where(eq(classGroup.id, group.id));
    await tx
      .update(lesson)
      .set({ status: "cancelled_by_teacher", cancelledAt: input.now, cancelledById: input.actorId })
      .where(
        and(
          eq(lesson.classGroupId, group.id),
          inArray(lesson.status, ["pending", "confirmed"]),
          gt(lesson.startsAt, input.now),
        ),
      );
    const ended = await tx
      .update(enrollment)
      .set({ status: "dropped", droppedAt: input.now })
      .where(and(eq(enrollment.classGroupId, group.id), seatTaking))
      .returning({ id: enrollment.id, studentId: enrollment.studentId });
    await removeEnrollmentCredits(
      tx,
      ended.map((e) => e.id),
    );
    return { studentIds: ended.map((e) => e.studentId) };
  });
}

/**
 * Adds a student to a class group with the plan matching its duration
 * (RN-004). A group holds at most 3 students; a student may be in several groups.
 */
export async function enrollStudent(
  db: Database,
  input: { classGroupId: string; studentId: string; planId: string; startedOn: string },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [group] = await tx
      .select()
      .from(classGroup)
      .where(eq(classGroup.id, input.classGroupId))
      .for("update");
    if (!group) throw new ClassesError("notFound");
    if (group.endsOn) throw new ClassesError("groupEnded");

    const [student] = await tx.select({ role: user.role }).from(user).where(eq(user.id, input.studentId));
    if (student?.role !== "student") throw new ClassesError("notAStudent");

    const [chosen] = await tx.select().from(plan).where(eq(plan.id, input.planId));
    if (!chosen?.active || chosen.durationMinutes !== group.durationMinutes) {
      throw new ClassesError("planMismatch");
    }

    const current = await tx.select().from(enrollment).where(eq(enrollment.classGroupId, group.id));
    if (current.filter((e) => e.status !== "dropped").length >= MAX_STUDENTS_PER_GROUP) {
      throw new ClassesError("groupFull");
    }
    const previous = current.find((e) => e.studentId === input.studentId);
    if (previous && previous.status !== "dropped") throw new ClassesError("alreadyEnrolled");

    if (previous) {
      // Coming back after leaving: same row, new participation dates.
      await tx
        .update(enrollment)
        .set({
          status: "active",
          planId: chosen.id,
          priceOverrideCents: null,
          startedOn: input.startedOn,
          droppedAt: null,
        })
        .where(eq(enrollment.id, previous.id));
    } else {
      await tx.insert(enrollment).values({
        classGroupId: group.id,
        studentId: input.studentId,
        planId: chosen.id,
        startedOn: input.startedOn,
      });
    }
  });
}

/**
 * A student leaves a class group (F-003, RN-027): they stop seeing future
 * lessons, keep their history, and the credits of this participation are cancelled.
 */
export async function removeEnrollment(
  db: Database,
  input: { enrollmentId: string; now: Date },
): Promise<{ studentId: string; classGroupId: string }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(enrollment)
      .set({ status: "dropped", droppedAt: input.now })
      .where(and(eq(enrollment.id, input.enrollmentId), seatTaking))
      .returning({ studentId: enrollment.studentId, classGroupId: enrollment.classGroupId });
    if (!row) throw new ClassesError("notFound");
    await removeEnrollmentCredits(tx, [input.enrollmentId]);
    return row;
  });
}

export async function listClassGroups(db: Database) {
  return db
    .select({
      group: classGroup,
      students: sql<number>`count(${enrollment.id}) filter (where ${enrollment.status} <> 'dropped')`.mapWith(
        Number,
      ),
    })
    .from(classGroup)
    .leftJoin(enrollment, eq(enrollment.classGroupId, classGroup.id))
    .groupBy(classGroup.id)
    .orderBy(asc(classGroup.weekday), asc(classGroup.startTime));
}

export async function getClassGroupDetail(db: Database, id: string) {
  const [group] = await db.select().from(classGroup).where(eq(classGroup.id, id));
  if (!group) return null;
  const students = await db
    .select({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      name: user.name,
      status: enrollment.status,
      startedOn: enrollment.startedOn,
      planName: plan.name,
    })
    .from(enrollment)
    .innerJoin(user, eq(user.id, enrollment.studentId))
    .innerJoin(plan, eq(plan.id, enrollment.planId))
    .where(and(eq(enrollment.classGroupId, id), seatTaking))
    .orderBy(asc(user.name));
  return { group, students };
}

/** Students who can be added to a class group (role "student"). */
export async function listStudents(db: Database) {
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.role, "student"))
    .orderBy(asc(user.name));
}

export async function listPlansForDuration(db: Database, durationMinutes: number) {
  return db
    .select({ id: plan.id, name: plan.name, priceCents: plan.priceCents })
    .from(plan)
    .where(and(eq(plan.active, true), eq(plan.durationMinutes, durationMinutes)))
    .orderBy(asc(plan.priceCents));
}
