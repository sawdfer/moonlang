import "server-only";
import { addDays } from "date-fns";
import { and, asc, eq, inArray, lt, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { classGroup, enrollment, lesson, user } from "@/db/schema";
import { toDateString } from "@/lib/dates";
import {
  canJoinLesson,
  type EnrollmentStatus,
  type LessonKind,
  type LessonStatus,
  MATERIALIZE_HORIZON_DAYS,
} from "./rules";

export type StudentViewer = { id: string; role: "student" | "trial" };

export type StudentLesson = {
  id: string;
  kind: LessonKind;
  status: LessonStatus;
  startsAt: Date;
  durationMinutes: number;
  groupName: string | null;
  /** The participation is blocked for non-payment (RN-015). */
  blocked: boolean;
  /** Only set when the viewer may join this lesson now (RN-015, RN-024). */
  meetingUrl: string | null;
};

/**
 * Upcoming lessons of the signed-in student, filtered on the server by their
 * own enrollments (F-004). Trial users only see their trial lesson (RN-018).
 */
export async function listUpcomingLessonsForStudent(
  db: Database,
  viewer: StudentViewer,
  now: Date,
): Promise<StudentLesson[]> {
  const enrollments =
    viewer.role === "student"
      ? await db
          .select({
            classGroupId: enrollment.classGroupId,
            status: enrollment.status,
            startedOn: enrollment.startedOn,
          })
          .from(enrollment)
          .where(and(eq(enrollment.studentId, viewer.id), ne(enrollment.status, "dropped")))
      : [];
  const byGroup = new Map(enrollments.map((e) => [e.classGroupId, e]));
  const groupIds = [...byGroup.keys()];

  const whose =
    viewer.role === "trial"
      ? and(eq(lesson.studentId, viewer.id), eq(lesson.kind, "trial"))
      : groupIds.length
        ? or(eq(lesson.studentId, viewer.id), inArray(lesson.classGroupId, groupIds))
        : eq(lesson.studentId, viewer.id);

  const rows = await db
    .select({
      id: lesson.id,
      kind: lesson.kind,
      status: lesson.status,
      startsAt: lesson.startsAt,
      durationMinutes: lesson.durationMinutes,
      classGroupId: lesson.classGroupId,
      studentId: lesson.studentId,
      lessonMeetingUrl: lesson.meetingUrl,
      groupName: classGroup.name,
      groupMeetingUrl: classGroup.meetingUrl,
    })
    .from(lesson)
    .leftJoin(classGroup, eq(classGroup.id, lesson.classGroupId))
    .where(
      and(
        whose,
        inArray(lesson.status, ["pending", "confirmed", "cancelled_by_teacher", "cancelled_by_student"]),
        sql`${lesson.startsAt} + ${lesson.durationMinutes} * interval '1 minute' > ${now.toISOString()}::timestamptz`,
        lt(lesson.startsAt, addDays(now, MATERIALIZE_HORIZON_DAYS)),
      ),
    )
    .orderBy(asc(lesson.startsAt));

  const result: StudentLesson[] = [];
  for (const row of rows) {
    const enrolled = row.classGroupId ? byGroup.get(row.classGroupId) : undefined;
    const own = row.studentId === viewer.id;
    // Someone else's individual lesson inside a shared group (e.g. a makeup).
    if (row.studentId && !own) continue;
    // Group lessons from before this student joined.
    if (!own && enrolled && enrolled.startedOn > toDateString(row.startsAt)) continue;

    const enrollmentStatus: EnrollmentStatus | null = enrolled?.status ?? null;
    const canJoin = canJoinLesson({ lesson: row, viewer, enrollmentStatus, now });
    result.push({
      id: row.id,
      kind: row.kind,
      status: row.status,
      startsAt: row.startsAt,
      durationMinutes: row.durationMinutes,
      groupName: row.groupName,
      blocked: enrollmentStatus === "blocked",
      meetingUrl: canJoin ? (row.lessonMeetingUrl ?? row.groupMeetingUrl) : null,
    });
  }
  return result;
}

/** The student's class groups with their classmates' names and weekly slot (F-003). */
export async function listClassGroupsForStudent(db: Database, studentId: string) {
  const mine = await db
    .select({ group: classGroup, status: enrollment.status })
    .from(enrollment)
    .innerJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .where(and(eq(enrollment.studentId, studentId), ne(enrollment.status, "dropped")))
    .orderBy(asc(classGroup.weekday), asc(classGroup.startTime));
  if (mine.length === 0) return [];

  const mates = await db
    .select({ classGroupId: enrollment.classGroupId, name: user.name })
    .from(enrollment)
    .innerJoin(user, eq(user.id, enrollment.studentId))
    .where(
      and(
        inArray(
          enrollment.classGroupId,
          mine.map((m) => m.group.id),
        ),
        eq(enrollment.status, "active"),
        ne(enrollment.studentId, studentId),
      ),
    );

  return mine.map(({ group, status }) => ({
    id: group.id,
    name: group.name,
    lessonType: group.lessonType,
    cefrLevel: group.cefrLevel,
    weekday: group.weekday,
    startTime: group.startTime.slice(0, 5),
    durationMinutes: group.durationMinutes,
    ended: group.endsOn !== null,
    blocked: status === "blocked",
    // First names only: classmates do not need each other's full names.
    classmates: mates.filter((m) => m.classGroupId === group.id).map((m) => m.name.split(" ")[0]!),
  }));
}
