// Read-only queries for the teacher dashboard (F-009). The dashboard creates no data
// of its own: it reads lessons, invites, charges and the WhatsApp queue.
// Teachers see their own lessons and charges; admins see everything (02-perfis).
import { and, asc, count, eq, gt, gte, inArray, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  charge,
  classGroup,
  enrollment,
  invite,
  lesson,
  studentProfile,
  user,
  whatsappMessage,
} from "@/db/schema";
import { isAdmin, type Role } from "@/server/auth/roles";
import { lessonParticipants } from "@/server/classes/lessons";
import { appDayRange, chargeState, newStudentsSince, summarizeCharges } from "./rules";

export type DashboardViewer = { id: string; role: Role };

export type DashboardLesson = {
  id: string;
  kind: string;
  status: "pending" | "confirmed" | "done";
  startsAt: Date;
  durationMinutes: number;
  groupName: string | null;
  /** Lesson link, or the class group's default one (RN-024). Staff only. */
  meetingUrl: string | null;
  participants: string[];
};

/** Today's lessons in São Paulo time, without cancelled or rejected ones. */
export async function listTodayLessons(db: Database, viewer: DashboardViewer, now: Date): Promise<DashboardLesson[]> {
  const { from, to } = appDayRange(now);
  const rows = await db
    .select({
      id: lesson.id,
      kind: lesson.kind,
      status: lesson.status,
      startsAt: lesson.startsAt,
      durationMinutes: lesson.durationMinutes,
      classGroupId: lesson.classGroupId,
      studentId: lesson.studentId,
      lessonUrl: lesson.meetingUrl,
      groupUrl: classGroup.meetingUrl,
      groupName: classGroup.name,
    })
    .from(lesson)
    .leftJoin(classGroup, eq(classGroup.id, lesson.classGroupId))
    .where(
      and(
        gte(lesson.startsAt, from),
        lt(lesson.startsAt, to),
        inArray(lesson.status, ["pending", "confirmed", "done"]),
        isAdmin(viewer.role) ? undefined : eq(lesson.teacherId, viewer.id),
      ),
    )
    .orderBy(asc(lesson.startsAt));
  const participants = await lessonParticipants(db, rows);
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    status: r.status as DashboardLesson["status"],
    startsAt: r.startsAt,
    durationMinutes: r.durationMinutes,
    groupName: r.groupName,
    meetingUrl: r.lessonUrl ?? r.groupUrl,
    participants: (participants.get(r.id) ?? []).map((p) => p.name),
  }));
}

/** Upcoming lessons requested by students and still waiting for a decision (RN-006). */
export async function listPendingRequests(db: Database, viewer: DashboardViewer, now: Date) {
  return db
    .select({
      id: lesson.id,
      kind: lesson.kind,
      startsAt: lesson.startsAt,
      durationMinutes: lesson.durationMinutes,
      requestedBy: user.name,
    })
    .from(lesson)
    .leftJoin(user, eq(user.id, lesson.requestedById))
    .where(
      and(
        eq(lesson.status, "pending"),
        gt(lesson.startsAt, now),
        isAdmin(viewer.role) ? undefined : eq(lesson.teacherId, viewer.id),
      ),
    )
    .orderBy(asc(lesson.startsAt));
}

/** Students and trial users who accepted an invite in the last 7 days (F-009). */
export async function listNewStudents(db: Database, now: Date) {
  return db
    .select({ id: user.id, name: user.name, role: user.role, joinedAt: invite.usedAt })
    .from(invite)
    .innerJoin(user, eq(user.id, invite.usedByUserId))
    .where(
      and(
        isNotNull(invite.usedAt),
        gte(invite.usedAt, newStudentsSince(now)),
        inArray(user.role, ["student", "trial"]),
      ),
    )
    .orderBy(asc(invite.usedAt));
}

function chargeOwner(viewer: DashboardViewer): SQL | undefined {
  return isAdmin(viewer.role) ? undefined : or(eq(classGroup.teacherId, viewer.id), eq(lesson.teacherId, viewer.id));
}

export type DashboardCharge = {
  id: string;
  studentName: string;
  kind: string;
  amountCents: number;
  dueDate: string;
  state: "pending" | "overdue";
};

/** Pending and overdue charges, oldest due date first, with their summary. */
export async function listOpenCharges(db: Database, viewer: DashboardViewer, now: Date) {
  const rows = await db
    .select({
      id: charge.id,
      studentName: user.name,
      kind: charge.kind,
      amountCents: charge.amountCents,
      dueDate: charge.dueDate,
      status: charge.status,
    })
    .from(charge)
    .innerJoin(user, eq(user.id, charge.studentId))
    .leftJoin(enrollment, eq(enrollment.id, charge.enrollmentId))
    .leftJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .leftJoin(lesson, eq(lesson.id, charge.lessonId))
    .where(and(inArray(charge.status, ["pending", "overdue"]), chargeOwner(viewer)))
    .orderBy(asc(charge.dueDate), asc(user.name));
  const charges: DashboardCharge[] = rows.map(({ status, ...r }) => ({ ...r, state: chargeState({ status, dueDate: r.dueDate }, now) }));
  return { charges, summary: summarizeCharges(rows, now) };
}

/** Students whose first charge is still open: their plan only starts once it is paid (RN-018, RN-025). */
export function awaitingFirstPayment(charges: DashboardCharge[]): DashboardCharge[] {
  return charges.filter((c) => c.kind === "first_prorated");
}

/** Messages the teacher still has to send; expired reminders do not count (F-008). */
export async function countWhatsAppQueue(db: Database, now: Date): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(whatsappMessage)
    .where(
      and(
        eq(whatsappMessage.status, "pending"),
        or(isNull(whatsappMessage.expiresAt), gt(whatsappMessage.expiresAt, now)),
      ),
    );
  return row?.value ?? 0;
}

/** CEFR level of a student, used to pick the tone of fun messages (F-010). */
export async function cefrLevelOf(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ level: studentProfile.cefrLevel })
    .from(studentProfile)
    .where(eq(studentProfile.userId, userId));
  return row?.level ?? null;
}

export async function loadDashboard(db: Database, viewer: DashboardViewer, now: Date) {
  const [todayLessons, requests, newStudents, openCharges, whatsapp] = await Promise.all([
    listTodayLessons(db, viewer, now),
    listPendingRequests(db, viewer, now),
    listNewStudents(db, now),
    listOpenCharges(db, viewer, now),
    countWhatsAppQueue(db, now),
  ]);
  return {
    todayLessons,
    requests,
    newStudents,
    firstPayments: awaitingFirstPayment(openCharges.charges),
    charges: openCharges.charges,
    chargesSummary: openCharges.summary,
    whatsapp,
  };
}
