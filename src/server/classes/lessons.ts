import "server-only";
import { addDays } from "date-fns";
import { and, asc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { classGroup, enrollment, lesson, lessonAttendance, scheduleBlock, user } from "@/db/schema";
import { toDateString } from "@/lib/dates";
import {
  expireCreditsForVacation,
  expireDueCredits,
  grantLessonCredits,
  type LessonCreditOrigin,
} from "@/server/credits/lesson-credits";
import {
  addDaysToDate,
  checkSchedule,
  hasScheduleIssue,
  isBlocked,
  type LessonKind,
  type LessonStatus,
  MATERIALIZE_HORIZON_DAYS,
  weeklyOccurrences,
  zonedDateTime,
} from "./rules";

export class ClassesError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

type AttendanceStatus = (typeof lessonAttendance.$inferSelect)["status"];

/** Lesson kinds that are part of a plan and give a lesson credit when the teacher cancels (RN-011, RN-018, RN-026). */
const CREDITED_KINDS: readonly LessonKind[] = ["weekly", "one_off", "makeup"];
const OPEN_STATUSES: LessonStatus[] = ["pending", "confirmed"];

const startOfDay = (date: string) => zonedDateTime(date, "00:00");

/**
 * Creates the upcoming weekly lessons of active class groups (RN-004).
 * Idempotent thanks to the unique (class_group_id, starts_at) constraint.
 * Days inside a schedule block are skipped: lessons that already existed there
 * were cancelled with credits when the block was created.
 */
export async function materializeWeeklyLessons(
  db: Database,
  now: Date,
  options: { until?: Date; groupIds?: string[]; teacherId?: string } = {},
): Promise<number> {
  const today = toDateString(now);
  const horizon = addDays(now, MATERIALIZE_HORIZON_DAYS);
  const to = options.until && options.until > horizon ? options.until : horizon;

  const groups = await db
    .select()
    .from(classGroup)
    .where(
      and(
        or(isNull(classGroup.endsOn), gte(classGroup.endsOn, today)),
        options.groupIds ? inArray(classGroup.id, options.groupIds) : undefined,
        options.teacherId ? eq(classGroup.teacherId, options.teacherId) : undefined,
      ),
    );
  if (groups.length === 0) return 0;

  const blocks = await db.select().from(scheduleBlock).where(gte(scheduleBlock.endsOn, today));
  const rows: (typeof lesson.$inferInsert)[] = [];
  for (const group of groups) {
    const teacherBlocks = blocks.filter((b) => b.teacherId === group.teacherId);
    for (const startsAt of weeklyOccurrences(group, { from: startOfDay(today), to })) {
      if (isBlocked(startsAt, teacherBlocks)) continue;
      rows.push({
        classGroupId: group.id,
        teacherId: group.teacherId,
        kind: "weekly",
        startsAt,
        durationMinutes: group.durationMinutes,
        status: "confirmed",
      });
    }
  }
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(lesson)
    .values(rows)
    .onConflictDoNothing({ target: [lesson.classGroupId, lesson.startsAt] })
    .returning({ id: lesson.id });
  return inserted.length;
}

type LessonRef = {
  id: string;
  classGroupId: string | null;
  studentId: string | null;
  startsAt: Date;
  status: LessonStatus;
};

export type Participant = {
  studentId: string;
  name: string;
  enrollmentId: string | null;
  attendance: AttendanceStatus | null;
};

/**
 * Who takes part in each lesson (F-004): the group's students enrolled on the
 * lesson date, the lesson's own student, and anyone already in the attendance
 * history. Students blocked for non-payment are left out of open lessons (RN-015).
 */
export async function lessonParticipants(
  db: Database,
  lessons: LessonRef[],
): Promise<Map<string, Participant[]>> {
  const result = new Map<string, Participant[]>();
  if (lessons.length === 0) return result;

  const groupIds = [...new Set(lessons.map((l) => l.classGroupId).filter((id): id is string => !!id))];
  const enrollments = groupIds.length
    ? await db
        .select({
          id: enrollment.id,
          classGroupId: enrollment.classGroupId,
          studentId: enrollment.studentId,
          status: enrollment.status,
          startedOn: enrollment.startedOn,
        })
        .from(enrollment)
        .where(inArray(enrollment.classGroupId, groupIds))
    : [];
  const attendance = await db
    .select()
    .from(lessonAttendance)
    .where(
      inArray(
        lessonAttendance.lessonId,
        lessons.map((l) => l.id),
      ),
    );

  const studentIds = new Set<string>([
    ...enrollments.map((e) => e.studentId),
    ...attendance.map((a) => a.studentId),
    ...lessons.map((l) => l.studentId).filter((id): id is string => !!id),
  ]);
  const users = studentIds.size
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, [...studentIds]))
    : [];
  const names = new Map(users.map((u) => [u.id, u.name]));

  for (const l of lessons) {
    const day = toDateString(l.startsAt);
    const open = OPEN_STATUSES.includes(l.status);
    const groupEnrollments = enrollments.filter((e) => e.classGroupId === l.classGroupId);
    const marks = new Map(attendance.filter((a) => a.lessonId === l.id).map((a) => [a.studentId, a.status]));
    const ids = new Set<string>(marks.keys());
    for (const e of groupEnrollments) {
      if (e.status === "active" && e.startedOn <= day) ids.add(e.studentId);
    }
    if (l.studentId) ids.add(l.studentId);

    const participants: Participant[] = [];
    for (const studentId of ids) {
      const e = groupEnrollments.find((x) => x.studentId === studentId);
      if (open && e?.status === "blocked") continue;
      // An individual lesson inside a group (e.g. a makeup) is only for its own student.
      if (l.studentId && l.studentId !== studentId && !marks.has(studentId)) continue;
      participants.push({
        studentId,
        name: names.get(studentId) ?? "—",
        enrollmentId: e?.id ?? null,
        attendance: marks.get(studentId) ?? null,
      });
    }
    participants.sort((a, b) => a.name.localeCompare(b.name));
    result.set(l.id, participants);
  }
  return result;
}

/**
 * Confirmed lessons that already ended become "done" (F-004). Attendance is
 * recorded when a student taps "Entrar na aula" (V1), so students who never
 * did are recorded as absent; the teacher can still correct it (RN-008, RN-012).
 */
export async function settleFinishedLessons(db: Database, now: Date): Promise<number> {
  const finished = await db
    .update(lesson)
    .set({ status: "done" })
    .where(
      and(
        eq(lesson.status, "confirmed"),
        sql`${lesson.startsAt} + ${lesson.durationMinutes} * interval '1 minute' <= ${now.toISOString()}::timestamptz`,
      ),
    )
    .returning({
      id: lesson.id,
      classGroupId: lesson.classGroupId,
      studentId: lesson.studentId,
      startsAt: lesson.startsAt,
      status: lesson.status,
    });
  if (finished.length === 0) return 0;

  // Participants are computed as for an open lesson, so blocked students get no mark.
  const participants = await lessonParticipants(
    db,
    finished.map((l) => ({ ...l, status: "confirmed" as const })),
  );
  const rows = finished.flatMap((l) =>
    (participants.get(l.id) ?? [])
      .filter((p) => p.attendance === null)
      .map((p) => ({ lessonId: l.id, studentId: p.studentId, status: "absent" as const })),
  );
  if (rows.length) await db.insert(lessonAttendance).values(rows).onConflictDoNothing();
  return finished.length;
}

/** Brings the schedule up to date. Called when the agenda or a student's lessons are opened. */
export async function syncSchedule(db: Database, now: Date): Promise<void> {
  await materializeWeeklyLessons(db, now);
  await settleFinishedLessons(db, now);
  await expireDueCredits(db, now);
}

/** Start instants of the teacher's current and future vacations (V2). */
export async function vacationStarts(db: Database, teacherId: string, now: Date): Promise<Date[]> {
  const rows = await db
    .select({ startsOn: scheduleBlock.startsOn })
    .from(scheduleBlock)
    .where(
      and(
        eq(scheduleBlock.teacherId, teacherId),
        eq(scheduleBlock.kind, "vacation"),
        gte(scheduleBlock.endsOn, toDateString(now)),
      ),
    );
  return rows.map((r) => startOfDay(r.startsOn));
}

export type CancelledLesson = {
  lessonId: string;
  startsAt: Date;
  classGroupId: string | null;
  /** Everyone who was expected in the lesson (to be notified). */
  studentIds: string[];
  /** Students who received a lesson credit (RN-011). */
  creditedStudentIds: string[];
  /** When those credits expire: 30 days, or earlier when a vacation starts (V2). */
  creditExpiresAt: Date | null;
};

async function cancelOne(
  db: Database,
  row: typeof lesson.$inferSelect,
  input: { actorId: string; now: Date; origin: LessonCreditOrigin },
): Promise<CancelledLesson> {
  const participants = (await lessonParticipants(db, [row])).get(row.id) ?? [];
  await db
    .update(lesson)
    .set({ status: "cancelled_by_teacher", cancelledAt: input.now, cancelledById: input.actorId })
    .where(eq(lesson.id, row.id));
  const granted = CREDITED_KINDS.includes(row.kind)
    ? await grantLessonCredits(db, {
        lessonId: row.id,
        lessonStartsAt: row.startsAt,
        recipients: participants.map((p) => ({ studentId: p.studentId, enrollmentId: p.enrollmentId })),
        origin: input.origin,
        grantedById: input.actorId,
        now: input.now,
        vacationStarts: await vacationStarts(db, row.teacherId, input.now),
      })
    : { studentIds: [], expiresAt: null };
  return {
    lessonId: row.id,
    startsAt: row.startsAt,
    classGroupId: row.classGroupId,
    studentIds: participants.map((p) => p.studentId),
    creditedStudentIds: granted.studentIds,
    creditExpiresAt: granted.expiresAt,
  };
}

/** The teacher cancels one lesson; each student gets a lesson credit (RN-011). */
export async function cancelLessonByTeacher(
  db: Database,
  input: { lessonId: string; actorId: string; now: Date },
): Promise<CancelledLesson> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(lesson).where(eq(lesson.id, input.lessonId)).for("update");
    if (!row) throw new ClassesError("notFound");
    if (!OPEN_STATUSES.includes(row.status)) throw new ClassesError("notCancellable");
    return cancelOne(tx, row, { ...input, origin: "teacher_cancellation" });
  });
}

export type ScheduleBlockKind = (typeof scheduleBlock.$inferSelect)["kind"];

/**
 * Blocks days on the teacher's agenda (vacation, holidays). Weekly lessons on
 * those days are cancelled by the teacher and each student gets a lesson
 * credit (F-004, RN-011). Lessons set by hand on those days are kept.
 * A vacation also makes every open credit expire when it starts (V2).
 */
export async function createScheduleBlock(
  db: Database,
  input: {
    teacherId: string;
    kind: ScheduleBlockKind;
    startsOn: string;
    endsOn: string;
    reason: string | null;
    now: Date;
  },
): Promise<{
  blockId: string;
  cancelled: CancelledLesson[];
  /** Per student, credits that now expire when the vacation starts. */
  expiringCredits: Map<string, number>;
}> {
  if (input.endsOn < input.startsOn) throw new ClassesError("invalidRange");
  if (input.startsOn < toDateString(input.now)) throw new ClassesError("pastDate");

  return db.transaction(async (tx) => {
    const until = startOfDay(addDaysToDate(input.endsOn, 1));
    // Make sure every weekly lesson inside the block exists before cancelling.
    await materializeWeeklyLessons(tx, input.now, { until, teacherId: input.teacherId });
    const [block] = await tx
      .insert(scheduleBlock)
      .values({
        teacherId: input.teacherId,
        kind: input.kind,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        reason: input.reason,
      })
      .returning({ id: scheduleBlock.id });

    const affected = await tx
      .select()
      .from(lesson)
      .where(
        and(
          eq(lesson.teacherId, input.teacherId),
          eq(lesson.kind, "weekly"),
          inArray(lesson.status, OPEN_STATUSES),
          gte(lesson.startsAt, startOfDay(input.startsOn)),
          lt(lesson.startsAt, until),
          gt(lesson.startsAt, input.now),
        ),
      )
      .orderBy(asc(lesson.startsAt));

    const cancelled: CancelledLesson[] = [];
    for (const row of affected) {
      cancelled.push(
        await cancelOne(tx, row, { actorId: input.teacherId, now: input.now, origin: "schedule_block" }),
      );
    }
    const expiringCredits =
      input.kind === "vacation"
        ? await expireCreditsForVacation(tx, {
            teacherId: input.teacherId,
            vacationStartsAt: startOfDay(input.startsOn),
            now: input.now,
          })
        : new Map<string, number>();
    return { blockId: block!.id, cancelled, expiringCredits };
  });
}

export type ScheduleIssue = {
  startsAt: Date;
  overlapping: boolean;
  dailyLimitReached: boolean;
  blocked: boolean;
};

/** Lessons of a teacher that occupy the agenda in a period, optionally ignoring one class group. */
async function busyLessons(
  db: Database,
  input: { teacherId: string; from: Date; to: Date; excludeGroupId?: string },
) {
  return db
    .select({ startsAt: lesson.startsAt, durationMinutes: lesson.durationMinutes, status: lesson.status })
    .from(lesson)
    .where(
      and(
        eq(lesson.teacherId, input.teacherId),
        gte(lesson.startsAt, input.from),
        lt(lesson.startsAt, input.to),
        input.excludeGroupId
          ? or(isNull(lesson.classGroupId), ne(lesson.classGroupId, input.excludeGroupId))
          : undefined,
      ),
    );
}

/** Checks a single lesson against overlaps, the daily limit and blocked days (RN-002, RN-003, F-004). */
export async function checkLessonSlot(
  db: Database,
  input: { teacherId: string; startsAt: Date; durationMinutes: number; maxLessonsPerDay: number },
): Promise<ScheduleIssue | null> {
  const day = toDateString(input.startsAt);
  const existing = await busyLessons(db, {
    teacherId: input.teacherId,
    from: addDays(startOfDay(day), -1),
    to: startOfDay(addDaysToDate(day, 2)),
  });
  const blocks = await db
    .select()
    .from(scheduleBlock)
    .where(eq(scheduleBlock.teacherId, input.teacherId));
  const check = checkSchedule(input, existing, input.maxLessonsPerDay);
  const blocked = isBlocked(input.startsAt, blocks);
  if (!hasScheduleIssue(check) && !blocked) return null;
  return {
    startsAt: input.startsAt,
    overlapping: check.overlapping.length > 0,
    dailyLimitReached: check.dailyLimitReached,
    blocked,
  };
}

/**
 * Checks the weekly slot of a class group for the next weeks against the
 * teacher's other lessons (F-003, RN-003). Returns one issue per conflicting date.
 */
export async function checkWeeklySlot(
  db: Database,
  input: {
    teacherId: string;
    weekday: number;
    startTime: string;
    startsOn: string;
    endsOn: string | null;
    durationMinutes: number;
    excludeGroupId?: string;
    maxLessonsPerDay: number;
    now: Date;
  },
): Promise<ScheduleIssue[]> {
  await materializeWeeklyLessons(db, input.now, { teacherId: input.teacherId });
  const to = addDays(input.now, MATERIALIZE_HORIZON_DAYS);
  const existing = await busyLessons(db, {
    teacherId: input.teacherId,
    from: addDays(input.now, -1),
    to: addDays(to, 1),
    excludeGroupId: input.excludeGroupId,
  });
  const issues: ScheduleIssue[] = [];
  for (const startsAt of weeklyOccurrences(input, { from: input.now, to })) {
    const check = checkSchedule({ startsAt, durationMinutes: input.durationMinutes }, existing, input.maxLessonsPerDay);
    if (hasScheduleIssue(check)) {
      issues.push({
        startsAt,
        overlapping: check.overlapping.length > 0,
        dailyLimitReached: check.dailyLimitReached,
        blocked: false,
      });
    }
  }
  return issues;
}

/** A lesson set by the teacher for a class group, confirmed from the start (RN-006). */
export async function createOneOffLesson(
  db: Database,
  input: {
    classGroupId: string;
    startsAt: Date;
    durationMinutes: number;
    meetingUrl: string | null;
    now: Date;
  },
): Promise<string> {
  if (input.startsAt <= input.now) throw new ClassesError("pastDate");
  const [group] = await db.select().from(classGroup).where(eq(classGroup.id, input.classGroupId));
  if (!group) throw new ClassesError("notFound");
  if (group.endsOn && group.endsOn < toDateString(input.startsAt)) throw new ClassesError("groupEnded");
  const [row] = await db
    .insert(lesson)
    .values({
      classGroupId: group.id,
      teacherId: group.teacherId,
      kind: "one_off",
      startsAt: input.startsAt,
      durationMinutes: input.durationMinutes,
      meetingUrl: input.meetingUrl,
      status: "confirmed",
    })
    .onConflictDoNothing({ target: [lesson.classGroupId, lesson.startsAt] })
    .returning({ id: lesson.id });
  if (!row) throw new ClassesError("duplicate");
  return row.id;
}

/** Records a student's attendance in a lesson that already started (RN-008, RN-010). */
export async function setAttendance(
  db: Database,
  input: { lessonId: string; studentId: string; status: AttendanceStatus; actorId: string; now: Date },
): Promise<void> {
  const [row] = await db.select().from(lesson).where(eq(lesson.id, input.lessonId));
  if (!row) throw new ClassesError("notFound");
  if (!["confirmed", "done"].includes(row.status)) throw new ClassesError("notOpen");
  if (row.startsAt > input.now) throw new ClassesError("notStarted");
  const participants = (await lessonParticipants(db, [row])).get(row.id) ?? [];
  if (!participants.some((p) => p.studentId === input.studentId)) throw new ClassesError("notParticipant");
  await db
    .insert(lessonAttendance)
    .values({
      lessonId: input.lessonId,
      studentId: input.studentId,
      status: input.status,
      markedById: input.actorId,
    })
    .onConflictDoUpdate({
      target: [lessonAttendance.lessonId, lessonAttendance.studentId],
      set: { status: input.status, markedById: input.actorId },
    });
}

/** Changes the meeting link of one lesson only (RN-024). `null` falls back to the class group link. */
export async function setLessonMeetingUrl(
  db: Database,
  input: { lessonId: string; meetingUrl: string | null },
): Promise<void> {
  await db.update(lesson).set({ meetingUrl: input.meetingUrl }).where(eq(lesson.id, input.lessonId));
}

export type AgendaLesson = {
  id: string;
  kind: LessonKind;
  status: LessonStatus;
  startsAt: Date;
  durationMinutes: number;
  classGroupId: string | null;
  groupName: string | null;
  participants: Participant[];
};

/** Lessons starting in [from, to), for the teacher's agenda. */
export async function listAgendaLessons(db: Database, range: { from: Date; to: Date }): Promise<AgendaLesson[]> {
  const rows = await db
    .select({
      id: lesson.id,
      kind: lesson.kind,
      status: lesson.status,
      startsAt: lesson.startsAt,
      durationMinutes: lesson.durationMinutes,
      classGroupId: lesson.classGroupId,
      studentId: lesson.studentId,
      groupName: classGroup.name,
    })
    .from(lesson)
    .leftJoin(classGroup, eq(classGroup.id, lesson.classGroupId))
    .where(and(gte(lesson.startsAt, range.from), lt(lesson.startsAt, range.to)))
    .orderBy(asc(lesson.startsAt));
  const participants = await lessonParticipants(db, rows);
  return rows.map((r) => ({ ...r, participants: participants.get(r.id) ?? [] }));
}

export async function getLessonDetail(db: Database, lessonId: string) {
  const [row] = await db
    .select({
      lesson,
      groupName: classGroup.name,
      groupMeetingUrl: classGroup.meetingUrl,
    })
    .from(lesson)
    .leftJoin(classGroup, eq(classGroup.id, lesson.classGroupId))
    .where(eq(lesson.id, lessonId));
  if (!row) return null;
  const participants = (await lessonParticipants(db, [row.lesson])).get(lessonId) ?? [];
  return { ...row, participants };
}

export async function listScheduleBlocks(db: Database, now: Date) {
  return db
    .select()
    .from(scheduleBlock)
    .where(gte(scheduleBlock.endsOn, toDateString(addDays(now, -90))))
    .orderBy(asc(scheduleBlock.startsOn));
}
