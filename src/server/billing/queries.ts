import "server-only";
import { and, asc, desc, eq, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { charge, classGroup, enrollment, lesson, plan, studentProfile, user } from "@/db/schema";
import { toDateString } from "@/lib/dates";
import { isAdmin } from "@/server/auth/roles";
import type { Actor } from "./index";
import { type ChargeStatus, effectiveStatus } from "./rules";

export type ChargeFilter = "open" | "overdue" | "paid" | "all";

/** Staff view of charges; teachers only see their own class groups and lessons (02-perfis). */
export async function listChargesForStaff(actor: Actor, filter: ChargeFilter, now = new Date()) {
  const today = toDateString(now);
  const owner: SQL | undefined = isAdmin(actor.role)
    ? undefined
    : or(eq(classGroup.teacherId, actor.id), eq(lesson.teacherId, actor.id));
  const byStatus: Record<ChargeFilter, ChargeStatus[]> = {
    open: ["pending", "overdue"],
    overdue: ["pending", "overdue"],
    paid: ["paid"],
    all: ["pending", "overdue", "paid", "cancelled"],
  };
  const rows = await db
    .select({
      charge,
      studentName: user.name,
      groupName: classGroup.name,
    })
    .from(charge)
    .innerJoin(user, eq(user.id, charge.studentId))
    .leftJoin(enrollment, eq(enrollment.id, charge.enrollmentId))
    .leftJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .leftJoin(lesson, eq(lesson.id, charge.lessonId))
    .where(and(inArray(charge.status, byStatus[filter]), owner))
    .orderBy(filter === "paid" ? desc(charge.paidAt) : asc(charge.dueDate), asc(user.name));

  return rows
    .map((r) => ({ ...r, status: effectiveStatus(r.charge, today) }))
    .filter((r) => filter !== "overdue" || r.status === "overdue");
}

/** Active enrollments that have no charge yet, waiting for the plan to start (RN-025). */
export async function listPlansToStart(actor: Actor) {
  const otherCharge = alias(charge, "existing_charge");
  const rows = await db
    .select({
      enrollmentId: enrollment.id,
      startedOn: enrollment.startedOn,
      studentName: user.name,
      studentRole: user.role,
      groupName: classGroup.name,
      planName: plan.name,
      priceCents: plan.priceCents,
      priceOverrideCents: enrollment.priceOverrideCents,
      dueDay: studentProfile.dueDay,
    })
    .from(enrollment)
    .innerJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .innerJoin(plan, eq(plan.id, enrollment.planId))
    .innerJoin(user, eq(user.id, enrollment.studentId))
    .leftJoin(studentProfile, eq(studentProfile.userId, enrollment.studentId))
    .leftJoin(
      otherCharge,
      and(
        eq(otherCharge.enrollmentId, enrollment.id),
        ne(otherCharge.kind, "extra_lesson"),
        ne(otherCharge.status, "cancelled"),
      ),
    )
    .where(
      and(
        eq(enrollment.status, "active"),
        isNull(otherCharge.id),
        isAdmin(actor.role) ? undefined : eq(classGroup.teacherId, actor.id),
      ),
    )
    .orderBy(asc(user.name));
  return rows.map((r) => ({ ...r, monthlyPriceCents: r.priceOverrideCents ?? r.priceCents }));
}

/** Enrollments that can still be dropped (RN-027). */
export async function listOpenEnrollments(actor: Actor) {
  return db
    .select({
      enrollmentId: enrollment.id,
      status: enrollment.status,
      studentName: user.name,
      groupName: classGroup.name,
      planName: plan.name,
    })
    .from(enrollment)
    .innerJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .innerJoin(plan, eq(plan.id, enrollment.planId))
    .innerJoin(user, eq(user.id, enrollment.studentId))
    .where(
      and(
        ne(enrollment.status, "dropped"),
        isAdmin(actor.role) ? undefined : eq(classGroup.teacherId, actor.id),
      ),
    )
    .orderBy(asc(user.name), asc(classGroup.name));
}

/** The signed-in student's own charges and enrollment states. Never takes an id from the client. */
export async function getOwnFinance(studentId: string, now = new Date()) {
  const today = toDateString(now);
  const rows = await db
    .select({ charge, groupName: classGroup.name })
    .from(charge)
    .leftJoin(enrollment, eq(enrollment.id, charge.enrollmentId))
    .leftJoin(classGroup, eq(classGroup.id, enrollment.classGroupId))
    .where(and(eq(charge.studentId, studentId), ne(charge.status, "cancelled")))
    .orderBy(desc(charge.dueDate), asc(charge.kind));
  const blocked = await db.$count(
    enrollment,
    and(eq(enrollment.studentId, studentId), eq(enrollment.status, "blocked")),
  );
  return {
    charges: rows.map((r) => ({ ...r.charge, groupName: r.groupName, status: effectiveStatus(r.charge, today) })),
    blocked: blocked > 0,
  };
}
