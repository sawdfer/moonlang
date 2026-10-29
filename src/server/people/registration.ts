import "server-only";
// Manual registration of students by staff (F-002).
import { randomBytes } from "node:crypto";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { classGroup, enrollment, plan, studentProfile, user } from "@/db/schema";
import { toDateString } from "@/lib/dates";
import { recordAudit } from "@/server/audit";
import { auth, WELCOME_RESET_PATH } from "@/server/auth/auth";
import { createUserWithPassword } from "@/server/auth/create-user";
import { isAdmin } from "@/server/auth/roles";
import { startPlan } from "@/server/billing";
import { enrollStudent } from "@/server/classes/groups";
import { MAX_STUDENTS_PER_GROUP } from "@/server/classes/rules";
import { isAdult } from "./rules";
import { type Actor, assertContactAvailable, assertDueDayOption, PeopleError } from "./students";

export type RegisterStudentInput = {
  kind: "trial" | "student" | "existing";
  name: string;
  email: string;
  phoneNumber: string;
  birthDate: string;
  goal: string | null;
  cefrLevel: (typeof studentProfile.$inferSelect)["cefrLevel"];
  classGroupId: string | null;
  planId: string | null;
  dueDay: number | null;
};

/** Checks the class group, plan and due day before any account is created. */
async function assertPlacement(actor: Actor, input: RegisterStudentInput) {
  const [group] = await db.select().from(classGroup).where(eq(classGroup.id, input.classGroupId!));
  if (!group || group.endsOn) throw new PeopleError("groupUnavailable");
  if (!isAdmin(actor.role) && group.teacherId !== actor.id) throw new PeopleError("groupUnavailable");
  const seats = await db.$count(
    enrollment,
    and(eq(enrollment.classGroupId, group.id), ne(enrollment.status, "dropped")),
  );
  if (seats >= MAX_STUDENTS_PER_GROUP) throw new PeopleError("groupUnavailable");
  const [chosen] = await db.select().from(plan).where(eq(plan.id, input.planId!));
  if (!chosen?.active || chosen.durationMinutes !== group.durationMinutes) {
    throw new PeopleError("planMismatch");
  }
  await assertDueDayOption(input.dueDay!);
}

/**
 * Registers someone without an invite (RN-020). The account gets a random
 * password and the person receives a link to choose their own; they accept the
 * terms on first access (RN-023). The current students ("existing") are
 * enrolled directly, with no trial and no prorated first charge: their first
 * monthly charge is due on the next due day (F-002, RN-025).
 */
export async function registerStudent(
  actor: Actor,
  input: RegisterStudentInput,
  now = new Date(),
): Promise<string> {
  const today = toDateString(now);
  if (!isAdult(input.birthDate, today)) throw new PeopleError("underage");
  await assertContactAvailable(input);
  if (input.kind === "existing") await assertPlacement(actor, input);

  const created = await createUserWithPassword({
    name: input.name,
    email: input.email,
    password: randomBytes(32).toString("base64url"),
    role: input.kind === "trial" ? "trial" : "student",
    phoneNumber: input.phoneNumber,
  });

  try {
    await db.insert(studentProfile).values({
      userId: created.id,
      birthDate: input.birthDate,
      goal: input.goal,
      cefrLevel: input.cefrLevel,
    });
    if (input.kind === "existing") {
      await enrollStudent(db, {
        classGroupId: input.classGroupId!,
        studentId: created.id,
        planId: input.planId!,
        startedOn: today,
      });
      const [row] = await db
        .select({ id: enrollment.id })
        .from(enrollment)
        .where(and(eq(enrollment.classGroupId, input.classGroupId!), eq(enrollment.studentId, created.id)));
      await startPlan(
        actor,
        { enrollmentId: row!.id, dueDay: input.dueDay!, startDate: today, existingStudent: true },
        now,
      );
    }
  } catch (error) {
    // Nothing half-done: the account was created a moment ago and holds no history yet.
    await db.delete(user).where(eq(user.id, created.id));
    throw error;
  }

  await recordAudit({
    actorId: actor.id,
    action: "student.registered",
    entityType: "user",
    entityId: created.id,
    data: { kind: input.kind },
  });
  await auth.api.requestPasswordReset({
    body: { email: input.email, redirectTo: WELCOME_RESET_PATH },
  });
  return created.id;
}
