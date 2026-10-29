import "server-only";
// Student management for staff (F-002): list, profile and edits.
import { and, asc, desc, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  classGroup,
  contactAttempt,
  credit,
  enrollment,
  lesson,
  lessonAttendance,
  plan,
  studentProfile,
  user,
} from "@/db/schema";
import { toDateString } from "@/lib/dates";
import { recordAudit } from "@/server/audit";
import { isAdmin, type Role } from "@/server/auth/roles";
import type { CurrentUser } from "@/server/auth/session";
import { getOwnFinance } from "@/server/billing/queries";
import { listUpcomingLessonsForStudent } from "@/server/classes/student";
import { getSetting } from "@/server/settings";
import { isAdult } from "./rules";
import {
  isRetentionDue,
  matchesFilter,
  retentionDueAt,
  type StudentFilter,
  studentSituation,
} from "./situation";
import { staffSeesStudent } from "./visibility";

export type Actor = Pick<CurrentUser, "id" | "role">;

const STUDENT_ROLES = ["student", "trial"] as const;

export class PeopleError extends Error {
  constructor(
    readonly code:
      | "notFound"
      | "forbidden"
      | "taken"
      | "underage"
      | "invalidDueDay"
      | "dueDayTooSoon"
      | "dueDayNotSet"
      | "wrongPassword"
      | "groupUnavailable"
      | "planMismatch",
    readonly data?: Record<string, string>,
  ) {
    super(code);
  }
}

async function enrollmentsOf(studentIds: string[]) {
  if (studentIds.length === 0) return [];
  return db
    .select({
      id: enrollment.id,
      studentId: enrollment.studentId,
      status: enrollment.status,
      startedOn: enrollment.startedOn,
      classGroupId: classGroup.id,
      groupName: classGroup.name,
      teacherId: classGroup.teacherId,
      planName: plan.name,
      priceCents: plan.priceCents,
      priceOverrideCents: enrollment.priceOverrideCents,
    })
    .from(enrollment)
    .innerJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .innerJoin(plan, eq(plan.id, enrollment.planId))
    .where(inArray(enrollment.studentId, studentIds))
    .orderBy(asc(classGroup.name));
}

/** Last time the student was seen: last access, or account creation if they never signed in (RN-021). */
function lastSeenOf(row: { lastAccessAt: Date | null; createdAt: Date }): Date {
  return row.lastAccessAt ?? row.createdAt;
}

export type StudentListItem = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  role: Role;
  cefrLevel: string | null;
  lastAccessAt: Date | null;
  status: ReturnType<typeof studentSituation>["status"];
  inactive: boolean;
  retentionDue: boolean;
  groups: { id: string; name: string; status: string }[];
};

/** Students the actor may see, with their situation, filtered (F-002, step 1). */
export async function listStudentsForStaff(
  actor: Actor,
  options: { filter: StudentFilter; classGroupId?: string | null },
  now = new Date(),
): Promise<StudentListItem[]> {
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      role: user.role,
      createdAt: user.createdAt,
      cefrLevel: studentProfile.cefrLevel,
      lastAccessAt: studentProfile.lastAccessAt,
      keptAt: studentProfile.retentionReviewedAt,
    })
    .from(user)
    .innerJoin(studentProfile, eq(studentProfile.userId, user.id))
    .where(inArray(user.role, [...STUDENT_ROLES]))
    .orderBy(asc(user.name));
  const enrollments = await enrollmentsOf(rows.map((r) => r.id));

  const result: StudentListItem[] = [];
  for (const row of rows) {
    const own = enrollments.filter((e) => e.studentId === row.id);
    if (!staffSeesStudent(actor, own.map((e) => e.teacherId))) continue;
    if (
      options.classGroupId &&
      !own.some((e) => e.classGroupId === options.classGroupId && e.status !== "dropped")
    ) {
      continue;
    }
    const lastSeen = lastSeenOf(row);
    const situation = studentSituation({
      role: row.role,
      enrollments: own.map((e) => e.status),
      lastSeen,
      now,
    });
    if (!matchesFilter(situation, options.filter)) continue;
    result.push({
      id: row.id,
      name: row.name,
      email: row.email,
      phoneNumber: row.phoneNumber,
      role: row.role,
      cefrLevel: row.cefrLevel,
      lastAccessAt: row.lastAccessAt,
      ...situation,
      retentionDue: situation.inactive && isRetentionDue(lastSeen, row.keptAt, now),
      groups: own.map((e) => ({ id: e.classGroupId, name: e.groupName, status: e.status })),
    });
  }
  return result;
}

/** Class groups for the list filter: the teacher's own, or all for admins. */
export async function listGroupsForFilter(actor: Actor) {
  return db
    .select({ id: classGroup.id, name: classGroup.name })
    .from(classGroup)
    .where(isAdmin(actor.role) ? undefined : eq(classGroup.teacherId, actor.id))
    .orderBy(asc(classGroup.name));
}

/** Loads the student and checks the actor may see them; throws `notFound` otherwise (never reveals existence). */
async function loadVisibleStudent(actor: Actor, studentId: string) {
  const [row] = await db
    .select({ user, profile: studentProfile })
    .from(user)
    .innerJoin(studentProfile, eq(studentProfile.userId, user.id))
    .where(and(eq(user.id, studentId), inArray(user.role, [...STUDENT_ROLES])));
  if (!row) throw new PeopleError("notFound");
  const enrollments = await enrollmentsOf([studentId]);
  if (!staffSeesStudent(actor, enrollments.map((e) => e.teacherId))) throw new PeopleError("notFound");
  return { ...row, enrollments };
}

/** Everything about one student in one place (F-002, step 2). Staff only. */
export async function getStudentForStaff(actor: Actor, studentId: string, now = new Date()) {
  const { user: u, profile, enrollments } = await loadVisibleStudent(actor, studentId);
  const role = u.role as "student" | "trial";
  const lastSeen = lastSeenOf({ lastAccessAt: profile.lastAccessAt, createdAt: u.createdAt });

  const [upcoming, history, credits, finance, attempts] = await Promise.all([
    listUpcomingLessonsForStudent(db, { id: u.id, role }, now),
    db
      .select({
        id: lesson.id,
        startsAt: lesson.startsAt,
        kind: lesson.kind,
        lessonStatus: lesson.status,
        attendance: lessonAttendance.status,
        groupName: classGroup.name,
      })
      .from(lesson)
      .leftJoin(
        lessonAttendance,
        and(eq(lessonAttendance.lessonId, lesson.id), eq(lessonAttendance.studentId, u.id)),
      )
      .leftJoin(classGroup, eq(classGroup.id, lesson.classGroupId))
      .where(
        and(
          lt(lesson.startsAt, now),
          or(eq(lessonAttendance.studentId, u.id), eq(lesson.studentId, u.id)),
        ),
      )
      .orderBy(desc(lesson.startsAt))
      .limit(40),
    db
      .select({
        id: credit.id,
        kind: credit.kind,
        origin: credit.origin,
        status: credit.status,
        expiresAt: credit.expiresAt,
      })
      .from(credit)
      .where(and(eq(credit.studentId, u.id), inArray(credit.status, ["available", "reserved"])))
      .orderBy(asc(credit.expiresAt)),
    getOwnFinance(u.id, now),
    db
      .select({
        id: contactAttempt.id,
        channel: contactAttempt.channel,
        outcome: contactAttempt.outcome,
        note: contactAttempt.note,
        createdAt: contactAttempt.createdAt,
        byName: user.name,
      })
      .from(contactAttempt)
      .innerJoin(user, eq(user.id, contactAttempt.createdById))
      .where(eq(contactAttempt.studentId, u.id))
      .orderBy(desc(contactAttempt.createdAt)),
  ]);

  const situation = studentSituation({ role, enrollments: enrollments.map((e) => e.status), lastSeen, now });
  return {
    student: {
      id: u.id,
      name: u.name,
      email: u.email,
      phoneNumber: u.phoneNumber,
      role,
      createdAt: u.createdAt,
      birthDate: profile.birthDate,
      goal: profile.goal,
      cefrLevel: profile.cefrLevel,
      dueDay: profile.dueDay,
      dueDayChangedAt: profile.dueDayChangedAt,
      lastAccessAt: profile.lastAccessAt,
      privateNotes: profile.privateNotes,
    },
    situation,
    retention: {
      dueAt: retentionDueAt(lastSeen, profile.retentionReviewedAt),
      due: situation.inactive && isRetentionDue(lastSeen, profile.retentionReviewedAt, now),
      keptAt: profile.retentionReviewedAt,
    },
    enrollments,
    upcoming,
    history,
    credits,
    charges: finance.charges,
    attempts,
  };
}

/** Throws `taken` when another account already uses the e-mail or phone (without saying which account). */
export async function assertContactAvailable(
  input: { email: string; phoneNumber: string | null },
  exceptUserId?: string,
) {
  const conditions = [eq(user.email, input.email)];
  if (input.phoneNumber) conditions.push(eq(user.phoneNumber, input.phoneNumber));
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(and(or(...conditions), exceptUserId ? ne(user.id, exceptUserId) : undefined));
  if (existing) throw new PeopleError("taken");
}

/** Staff edit data, level and private notes (F-002, step 3). */
export async function updateStudentByStaff(
  actor: Actor,
  studentId: string,
  input: {
    name: string;
    email: string;
    phoneNumber: string;
    birthDate: string;
    goal: string | null;
    cefrLevel: (typeof studentProfile.$inferSelect)["cefrLevel"];
    privateNotes: string | null;
  },
  now = new Date(),
) {
  await loadVisibleStudent(actor, studentId);
  if (!isAdult(input.birthDate, toDateString(now))) throw new PeopleError("underage");
  await assertContactAvailable(input, studentId);
  await db
    .update(user)
    .set({ name: input.name, email: input.email, phoneNumber: input.phoneNumber, updatedAt: now })
    .where(eq(user.id, studentId));
  await db
    .update(studentProfile)
    .set({
      birthDate: input.birthDate,
      goal: input.goal,
      cefrLevel: input.cefrLevel,
      privateNotes: input.privateNotes,
    })
    .where(eq(studentProfile.userId, studentId));
}

/** Due day chosen from the admin's options (RN-025). */
export async function assertDueDayOption(day: number) {
  const options = await getSetting("dueDayOptions");
  if (!options.includes(day)) throw new PeopleError("invalidDueDay");
}

/** RN-025 exception: admins change the due day outside the 3-month window. */
export async function setDueDayByAdmin(actor: Actor, studentId: string, dueDay: number, now = new Date()) {
  if (!isAdmin(actor.role)) throw new PeopleError("forbidden");
  const { profile } = await loadVisibleStudent(actor, studentId);
  await assertDueDayOption(dueDay);
  await db
    .update(studentProfile)
    .set({ dueDay, dueDayChangedAt: now })
    .where(eq(studentProfile.userId, studentId));
  await recordAudit({
    actorId: actor.id,
    action: "student.due_day_changed",
    entityType: "user",
    entityId: studentId,
    data: { from: profile.dueDay, to: dueDay, override: true },
  });
}

export { loadVisibleStudent };

/** Open class groups and active plans for placing a current student (F-002, RN-004). */
export async function listPlacementOptions(actor: Actor) {
  const [groups, plans] = await Promise.all([
    db
      .select({ id: classGroup.id, name: classGroup.name, durationMinutes: classGroup.durationMinutes })
      .from(classGroup)
      .where(
        and(
          isNull(classGroup.endsOn),
          isAdmin(actor.role) ? undefined : eq(classGroup.teacherId, actor.id),
        ),
      )
      .orderBy(asc(classGroup.name)),
    db
      .select({ id: plan.id, name: plan.name, durationMinutes: plan.durationMinutes, priceCents: plan.priceCents })
      .from(plan)
      .where(eq(plan.active, true))
      .orderBy(asc(plan.priceCents)),
  ]);
  return { groups, plans, dueDayOptions: await getSetting("dueDayOptions") };
}
