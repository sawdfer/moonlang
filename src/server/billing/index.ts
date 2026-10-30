import "server-only";
import { TZDate } from "@date-fns/tz";
import { and, eq, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { charge, classGroup, enrollment, lesson, plan, studentProfile, user } from "@/db/schema";
import { APP_TIME_ZONE, toDateString } from "@/lib/dates";
import { recordAudit } from "@/server/audit";
import { isAdmin, isStaff, type Role } from "@/server/auth/roles";
import { getSetting } from "@/server/settings";
import { noticeBlockWarning, noticeDueSoon, noticeOverdue } from "./notices";
import {
  blockingDecision,
  blockingOverdueCharges,
  blockWarning,
  type ChargeDraft,
  chargeAfterUnblock,
  coveredUntil,
  cycleEnd,
  type Day,
  dueSoonCharges,
  effectiveStatus,
  extraLessonDueDate,
  extraLessonPriceCents,
  nextDueDate,
  nextMonthlyCharge,
  parseDay,
  planFirstCharge,
} from "./rules";

/** Who is acting: a narrow view of the signed-in user (see `requireStaff`). */
export type Actor = { id: string; role: Role };

/** Expected failures, shown to the user. `code` is stable; `message` is for logs. */
export class BillingError extends Error {
  constructor(
    readonly code:
      | "forbidden"
      | "not_found"
      | "invalid_due_day"
      | "already_started"
      | "not_payable"
      | "not_paid"
      | "invalid_amount"
      | "missing_profile"
      | "dropped"
      | "reason_required"
      | "invalid_date"
      | "duplicate_cycle"
      | "not_blocked"
      | "not_editable",
    message?: string,
  ) {
    super(message ?? code);
  }
}

function assertStaff(actor: Actor) {
  if (!isStaff(actor.role)) throw new BillingError("forbidden");
}

/** Managing a student's charges is admin/root only (RN-015, V7). */
function assertAdmin(actor: Actor) {
  if (!isAdmin(actor.role)) throw new BillingError("forbidden");
}

/** Manual changes always carry a reason for the audit log (RN-012, V7). */
function requireReason(reason: string | undefined): string {
  const text = reason?.trim() ?? "";
  if (!text) throw new BillingError("reason_required");
  return text.slice(0, 500);
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Teachers only manage their own class groups; admins and root manage everything (02-perfis). */
async function assertManagesEnrollment(actor: Actor, enrollmentId: string) {
  assertStaff(actor);
  const [row] = await db
    .select({ teacherId: classGroup.teacherId })
    .from(enrollment)
    .innerJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .where(eq(enrollment.id, enrollmentId));
  if (!row) throw new BillingError("not_found");
  if (!isAdmin(actor.role) && row.teacherId !== actor.id) throw new BillingError("forbidden");
}

async function loadManagedCharge(actor: Actor, chargeId: string) {
  assertStaff(actor);
  const [row] = await db
    .select({ charge, groupTeacherId: classGroup.teacherId, lessonTeacherId: lesson.teacherId })
    .from(charge)
    .leftJoin(enrollment, eq(enrollment.id, charge.enrollmentId))
    .leftJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .leftJoin(lesson, eq(lesson.id, charge.lessonId))
    .where(eq(charge.id, chargeId));
  if (!row) throw new BillingError("not_found");
  const owns = row.groupTeacherId === actor.id || row.lessonTeacherId === actor.id;
  if (!isAdmin(actor.role) && !owns) throw new BillingError("forbidden");
  return row.charge;
}

/** A calendar day as an instant: now if it is today, otherwise noon in São Paulo. */
function dayToInstant(day: Day, now: Date): Date {
  if (day === toDateString(now)) return now;
  const d = parseDay(day);
  return new TZDate(d.getFullYear(), d.getMonth(), d.getDate(), 12, APP_TIME_ZONE);
}

async function loadEnrollmentContext(enrollmentId: string) {
  const [row] = await db
    .select({
      enrollment,
      group: classGroup,
      planPriceCents: plan.priceCents,
      student: { id: user.id, name: user.name, role: user.role, phoneNumber: user.phoneNumber },
      dueDay: studentProfile.dueDay,
    })
    .from(enrollment)
    .innerJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .innerJoin(plan, eq(plan.id, enrollment.planId))
    .innerJoin(user, eq(user.id, enrollment.studentId))
    .leftJoin(studentProfile, eq(studentProfile.userId, enrollment.studentId))
    .where(eq(enrollment.id, enrollmentId));
  if (!row) return null;
  const charges = await db.select().from(charge).where(eq(charge.enrollmentId, enrollmentId));
  return {
    ...row,
    charges,
    monthlyPriceCents: row.enrollment.priceOverrideCents ?? row.planPriceCents,
    schedule: { weekday: row.group.weekday, startsOn: row.group.startsOn, endsOn: row.group.endsOn },
  };
}

function insertDraft(studentId: string, enrollmentId: string, draft: ChargeDraft) {
  return db
    .insert(charge)
    .values({
      studentId,
      enrollmentId,
      kind: draft.kind,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      amountCents: draft.amountCents,
      dueDate: draft.dueDate,
    })
    .returning();
}

/**
 * Starts the plan of an enrollment (RN-025): saves the due day and creates the
 * first prorated charge, due right away. Current students registered without a
 * trial (`existingStudent`) skip the prorated charge: their first monthly
 * charge is due on the next due day.
 */
export async function startPlan(
  actor: Actor,
  input: { enrollmentId: string; dueDay: number; startDate: Day; existingStudent?: boolean },
  now = new Date(),
) {
  await assertManagesEnrollment(actor, input.enrollmentId);
  const ctx = await loadEnrollmentContext(input.enrollmentId);
  if (!ctx) throw new BillingError("not_found");
  if (ctx.enrollment.status !== "active") throw new BillingError("dropped");
  if (coveredUntil(ctx.charges) || ctx.charges.some((c) => c.kind === "first_prorated" && c.status !== "cancelled")) {
    throw new BillingError("already_started");
  }
  if (ctx.dueDay === null && !(await db.$count(studentProfile, eq(studentProfile.userId, ctx.student.id)))) {
    throw new BillingError("missing_profile");
  }
  // One due day per student: all monthly fees are due together (F-007).
  const dueDay = ctx.dueDay ?? input.dueDay;
  const options = await getSetting("dueDayOptions");
  if (ctx.dueDay === null && !options.includes(dueDay)) throw new BillingError("invalid_due_day");
  if (input.existingStudent && ctx.student.role !== "student") throw new BillingError("forbidden");

  const today = toDateString(now);
  let draft: ChargeDraft;
  if (input.existingStudent) {
    const due = nextDueDate(input.startDate, dueDay);
    draft = {
      kind: "monthly",
      periodStart: due,
      periodEnd: cycleEnd(due, dueDay),
      amountCents: ctx.monthlyPriceCents,
      dueDate: due,
    };
  } else {
    draft = planFirstCharge({
      startDate: input.startDate,
      dueDay,
      group: ctx.schedule,
      monthlyPriceCents: ctx.monthlyPriceCents,
      today,
    });
  }

  if (ctx.dueDay === null) {
    await db
      .update(studentProfile)
      .set({ dueDay, dueDayChangedAt: now })
      .where(eq(studentProfile.userId, ctx.student.id));
  }
  await db.update(enrollment).set({ startedOn: input.startDate }).where(eq(enrollment.id, input.enrollmentId));
  const [created] = await insertDraft(ctx.student.id, input.enrollmentId, draft);
  await recordAudit({
    actorId: actor.id,
    action: "billing.plan_started",
    entityType: "enrollment",
    entityId: input.enrollmentId,
    data: { dueDay, startDate: input.startDate, chargeId: created!.id, ...draft },
  });
  return created!;
}

/**
 * Applies the automatic rules to one enrollment (RN-013, RN-015, RN-025, RN-027):
 * blocks or unblocks it, adds the prorated charge after an unblock and
 * generates the monthly charges that are due soon.
 */
export async function reconcileEnrollment(enrollmentId: string, now = new Date()) {
  const ctx = await loadEnrollmentContext(enrollmentId);
  if (!ctx || ctx.dueDay === null) return;
  const today = toDateString(now);
  const charges = [...ctx.charges];
  let status = ctx.enrollment.status;

  const decision = blockingDecision(status, charges, today);
  if (decision) {
    status = decision === "block" ? "blocked" : "active";
    await db.update(enrollment).set({ status }).where(eq(enrollment.id, enrollmentId));
    await recordAudit({
      actorId: null,
      action: decision === "block" ? "enrollment.blocked" : "enrollment.unblocked",
      entityType: "enrollment",
      entityId: enrollmentId,
    });
  }
  if (decision === "unblock") {
    const draft = chargeAfterUnblock({
      charges,
      dueDay: ctx.dueDay,
      group: ctx.schedule,
      monthlyPriceCents: ctx.monthlyPriceCents,
      today,
    });
    if (draft) charges.push(...(await insertDraft(ctx.student.id, enrollmentId, draft)));
  }

  // Loop to catch up if the daily job missed some days; capped as a safety net.
  for (let i = 0; i < 24; i++) {
    const draft = nextMonthlyCharge({
      status,
      charges,
      dueDay: ctx.dueDay,
      monthlyPriceCents: ctx.monthlyPriceCents,
      group: ctx.schedule,
      today,
    });
    if (!draft) break;
    const [created] = await insertDraft(ctx.student.id, enrollmentId, draft);
    charges.push(created!);
  }

  // Blocked students get no reminders (V8); they still see everything on their finance page.
  if (status !== "active") return;
  for (const c of dueSoonCharges(charges, today)) {
    await noticeDueSoon(ctx.student, { chargeId: c.id, amountCents: c.amountCents, dueDate: c.dueDate });
  }
  const warning = blockWarning({ status, charges, dueDay: ctx.dueDay, today });
  if (warning) {
    await noticeBlockWarning(ctx.student, {
      chargeId: warning.charge.id,
      amountCents: warning.charge.amountCents,
      dueDate: warning.charge.dueDate,
      deadline: warning.deadline,
    });
  }
}

/**
 * Daily job (F-007): marks overdue charges, then blocks/unblocks enrollments and
 * generates monthly charges. Safe to run more than once a day.
 */
export async function runDailyBilling(now = new Date()) {
  const today = toDateString(now);
  const overdue = await db
    .update(charge)
    .set({ status: "overdue" })
    .where(and(eq(charge.status, "pending"), lt(charge.dueDate, today)))
    .returning();

  const studentIds = [...new Set(overdue.map((c) => c.studentId))];
  const students = studentIds.length
    ? await db
        .select({ id: user.id, name: user.name, phoneNumber: user.phoneNumber })
        .from(user)
        .where(inArray(user.id, studentIds))
    : [];
  for (const c of overdue) {
    // Extra lessons go with a monthly fee, which already triggers its own notice (RN-026).
    if (c.kind === "extra_lesson") continue;
    const student = students.find((s) => s.id === c.studentId);
    if (student) await noticeOverdue(student, { chargeId: c.id, amountCents: c.amountCents, dueDate: c.dueDate });
  }

  const enrollments = await db
    .select({ id: enrollment.id })
    .from(enrollment)
    .where(ne(enrollment.status, "dropped"));
  for (const e of enrollments) await reconcileEnrollment(e.id, now);

  return { overdue: overdue.length, enrollments: enrollments.length };
}

/**
 * Records a Pix payment (RN-014). The amount received may differ from the
 * charge; the difference stays visible. Paying the first charge turns a trial
 * account into a student (RN-018, RN-025); paying open charges may lift a block (RN-015).
 */
export async function markChargePaid(
  actor: Actor,
  input: { chargeId: string; receivedCents: number; paidOn: Day; note?: string },
  now = new Date(),
) {
  const current = await loadManagedCharge(actor, input.chargeId);
  if (current.status !== "pending" && current.status !== "overdue") throw new BillingError("not_payable");
  if (!Number.isInteger(input.receivedCents) || input.receivedCents < 0) throw new BillingError("invalid_amount");

  const note = input.note?.trim() || null;
  const [updated] = await db
    .update(charge)
    .set({ status: "paid", paidAt: dayToInstant(input.paidOn, now), receivedCents: input.receivedCents, note })
    .where(and(eq(charge.id, current.id), inArray(charge.status, ["pending", "overdue"])))
    .returning();
  if (!updated) throw new BillingError("not_payable");
  await recordAudit({
    actorId: actor.id,
    action: "charge.paid",
    entityType: "charge",
    entityId: current.id,
    data: {
      previousStatus: current.status,
      amountCents: current.amountCents,
      receivedCents: input.receivedCents,
      paidOn: input.paidOn,
      note,
    },
  });

  if (current.kind === "first_prorated") {
    const converted = await db
      .update(user)
      .set({ role: "student", updatedAt: now })
      .where(and(eq(user.id, current.studentId), eq(user.role, "trial")))
      .returning({ id: user.id });
    if (converted.length) {
      await recordAudit({
        actorId: actor.id,
        action: "user.role_changed",
        entityType: "user",
        entityId: current.studentId,
        data: { from: "trial", to: "student", chargeId: current.id },
        reason: "First charge paid (RN-025)",
      });
    }
  }

  if (current.enrollmentId) await reconcileEnrollment(current.enrollmentId, now);
  return updated;
}

/**
 * Undoes a payment marked by mistake (F-007). If it was the first charge that
 * converted a trial account, the account goes back to trial.
 */
export async function undoChargePayment(actor: Actor, input: { chargeId: string }, now = new Date()) {
  const current = await loadManagedCharge(actor, input.chargeId);
  if (current.status !== "paid") throw new BillingError("not_paid");

  const status = effectiveStatus({ status: "pending", dueDate: current.dueDate }, toDateString(now));
  const [updated] = await db
    .update(charge)
    .set({ status, paidAt: null, receivedCents: null, note: null })
    .where(and(eq(charge.id, current.id), eq(charge.status, "paid")))
    .returning();
  if (!updated) throw new BillingError("not_paid");
  await recordAudit({
    actorId: actor.id,
    action: "charge.payment_undone",
    entityType: "charge",
    entityId: current.id,
    data: {
      paidAt: current.paidAt?.toISOString() ?? null,
      receivedCents: current.receivedCents,
      note: current.note,
      newStatus: status,
    },
  });

  if (current.kind === "first_prorated") {
    const otherPaid = await db.$count(
      charge,
      and(eq(charge.studentId, current.studentId), eq(charge.status, "paid")),
    );
    if (otherPaid === 0) {
      const reverted = await db
        .update(user)
        .set({ role: "trial", updatedAt: now })
        .where(and(eq(user.id, current.studentId), eq(user.role, "student")))
        .returning({ id: user.id });
      if (reverted.length) {
        await recordAudit({
          actorId: actor.id,
          action: "user.role_changed",
          entityType: "user",
          entityId: current.studentId,
          data: { from: "student", to: "trial", chargeId: current.id },
          reason: "First charge payment undone",
        });
      }
    }
  }

  if (current.enrollmentId) await reconcileEnrollment(current.enrollmentId, now);
  return updated;
}

/** Ends an enrollment: no new charges from now on (RN-027). Existing charges are settled outside (RN-022). */
export async function registerDropout(
  actor: Actor,
  input: { enrollmentId: string; reason?: string },
  now = new Date(),
) {
  await assertManagesEnrollment(actor, input.enrollmentId);
  const [updated] = await db
    .update(enrollment)
    .set({ status: "dropped", droppedAt: now })
    .where(and(eq(enrollment.id, input.enrollmentId), ne(enrollment.status, "dropped")))
    .returning();
  if (!updated) throw new BillingError("dropped");
  await recordAudit({
    actorId: actor.id,
    action: "enrollment.dropped",
    entityType: "enrollment",
    entityId: input.enrollmentId,
    reason: input.reason?.trim() || undefined,
  });
  return updated;
}

/**
 * Unblocks a student despite overdue charges, after a deal made outside the
 * platform (RN-012, RN-015, V7). The overdue charges stay open but stop counting
 * for blocking; new overdue charges count again.
 */
export async function manualUnblock(
  actor: Actor,
  input: { enrollmentId: string; reason?: string },
  now = new Date(),
) {
  await assertManagesEnrollment(actor, input.enrollmentId);
  const reason = requireReason(input.reason);
  const ctx = await loadEnrollmentContext(input.enrollmentId);
  if (!ctx) throw new BillingError("not_found");
  if (ctx.enrollment.status !== "blocked") throw new BillingError("not_blocked");

  const waived = blockingOverdueCharges(ctx.charges, toDateString(now));
  if (waived.length) {
    await db
      .update(charge)
      .set({ blockWaivedAt: now })
      .where(inArray(charge.id, waived.map((c) => c.id)));
  }
  await recordAudit({
    actorId: actor.id,
    action: "enrollment.unblocked_manually",
    entityType: "enrollment",
    entityId: input.enrollmentId,
    data: { waivedChargeIds: waived.map((c) => c.id) },
    reason,
  });
  // With no blocking charge left, the usual unblock runs, prorated charge included (RN-015).
  await reconcileEnrollment(input.enrollmentId, now);
}

async function loadChargeForAdmin(actor: Actor, chargeId: string) {
  assertAdmin(actor);
  const [row] = await db.select().from(charge).where(eq(charge.id, chargeId));
  if (!row) throw new BillingError("not_found");
  return row;
}

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Cancels an open charge (V7). A cancelled monthly charge waives its cycle: it is not generated again. */
export async function cancelCharge(actor: Actor, input: { chargeId: string; reason?: string }, now = new Date()) {
  const current = await loadChargeForAdmin(actor, input.chargeId);
  const reason = requireReason(input.reason);
  if (current.status !== "pending" && current.status !== "overdue") throw new BillingError("not_editable");
  await db.update(charge).set({ status: "cancelled" }).where(eq(charge.id, current.id));
  await recordAudit({
    actorId: actor.id,
    action: "charge.cancelled",
    entityType: "charge",
    entityId: current.id,
    data: { previousStatus: current.status, amountCents: current.amountCents, dueDate: current.dueDate },
    reason,
  });
  if (current.enrollmentId) await reconcileEnrollment(current.enrollmentId, now);
}

/** Changes the amount and/or due date of an open charge, overdue ones included (V7). */
export async function editCharge(
  actor: Actor,
  input: { chargeId: string; amountCents: number; dueDate: Day; reason?: string },
  now = new Date(),
) {
  const current = await loadChargeForAdmin(actor, input.chargeId);
  const reason = requireReason(input.reason);
  if (current.status !== "pending" && current.status !== "overdue") throw new BillingError("not_editable");
  if (!Number.isInteger(input.amountCents) || input.amountCents < 0) throw new BillingError("invalid_amount");
  if (!DAY_PATTERN.test(input.dueDate)) throw new BillingError("invalid_date");

  const status = effectiveStatus({ status: "pending", dueDate: input.dueDate }, toDateString(now));
  await db
    .update(charge)
    .set({ amountCents: input.amountCents, dueDate: input.dueDate, status })
    .where(eq(charge.id, current.id));
  await recordAudit({
    actorId: actor.id,
    action: "charge.edited",
    entityType: "charge",
    entityId: current.id,
    data: {
      from: { amountCents: current.amountCents, dueDate: current.dueDate, status: current.status },
      to: { amountCents: input.amountCents, dueDate: input.dueDate, status },
    },
    reason,
  });
  if (current.enrollmentId) await reconcileEnrollment(current.enrollmentId, now);
}

/**
 * Adds a charge by hand (V7): a monthly fee, optionally for a cycle, or a
 * one-off item. Two cycle charges can never share a period start.
 */
export async function addCharge(
  actor: Actor,
  input: {
    enrollmentId: string;
    kind: "monthly" | "extra_lesson";
    amountCents: number;
    dueDate: Day;
    periodStart?: Day;
    periodEnd?: Day;
    reason?: string;
  },
  now = new Date(),
) {
  assertAdmin(actor);
  const reason = requireReason(input.reason);
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new BillingError("invalid_amount");
  if (!DAY_PATTERN.test(input.dueDate)) throw new BillingError("invalid_date");
  const hasPeriod = Boolean(input.periodStart || input.periodEnd);
  if (
    hasPeriod &&
    (input.kind !== "monthly" ||
      !DAY_PATTERN.test(input.periodStart ?? "") ||
      !DAY_PATTERN.test(input.periodEnd ?? "") ||
      input.periodEnd! < input.periodStart!)
  ) {
    throw new BillingError("invalid_date");
  }
  const [row] = await db
    .select({ studentId: enrollment.studentId })
    .from(enrollment)
    .where(eq(enrollment.id, input.enrollmentId));
  if (!row) throw new BillingError("not_found");

  const today = toDateString(now);
  let created;
  try {
    [created] = await db
      .insert(charge)
      .values({
        studentId: row.studentId,
        enrollmentId: input.enrollmentId,
        kind: input.kind,
        periodStart: hasPeriod ? input.periodStart : null,
        periodEnd: hasPeriod ? input.periodEnd : null,
        amountCents: input.amountCents,
        dueDate: input.dueDate,
        status: effectiveStatus({ status: "pending", dueDate: input.dueDate }, today),
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) throw new BillingError("duplicate_cycle");
    throw error;
  }
  await recordAudit({
    actorId: actor.id,
    action: "charge.added",
    entityType: "charge",
    entityId: created!.id,
    data: {
      kind: input.kind,
      amountCents: input.amountCents,
      dueDate: input.dueDate,
      periodStart: input.periodStart ?? null,
      periodEnd: input.periodEnd ?? null,
    },
    reason,
  });
  await reconcileEnrollment(input.enrollmentId, now);
  return created!;
}

/**
 * Charges an extra lesson with the student's next monthly fee (RN-026).
 * Called by the lessons domain when an extra lesson is confirmed.
 */
export async function addExtraLessonCharge(input: { lessonId: string; enrollmentId?: string }, now = new Date()) {
  const [row] = await db
    .select({ lesson, dueDay: studentProfile.dueDay })
    .from(lesson)
    .leftJoin(studentProfile, eq(studentProfile.userId, lesson.studentId))
    .where(eq(lesson.id, input.lessonId));
  if (!row?.lesson.studentId) throw new BillingError("not_found");
  if (row.dueDay === null) throw new BillingError("missing_profile", "Student has no plan yet.");
  const studentId = row.lesson.studentId;

  const paidMonthly = await db
    .select({ dueDate: charge.dueDate })
    .from(charge)
    .where(and(eq(charge.studentId, studentId), eq(charge.kind, "monthly"), eq(charge.status, "paid")));
  const dueDate = extraLessonDueDate({
    today: toDateString(now),
    dueDay: row.dueDay,
    paidMonthlyDueDates: paidMonthly.map((c) => c.dueDate),
  });
  const amountCents = extraLessonPriceCents(row.lesson.durationMinutes, await getSetting("extraHourPriceCents"));
  const [created] = await db
    .insert(charge)
    .values({
      studentId,
      enrollmentId: input.enrollmentId ?? null,
      kind: "extra_lesson",
      amountCents,
      dueDate,
      lessonId: input.lessonId,
    })
    .returning();
  return created!;
}

/** An extra lesson cancelled in time is not charged (RN-026). */
export async function removeExtraLessonCharge(lessonId: string) {
  await db
    .update(charge)
    .set({ status: "cancelled" })
    .where(
      and(eq(charge.lessonId, lessonId), eq(charge.kind, "extra_lesson"), inArray(charge.status, ["pending", "overdue"])),
    );
}
