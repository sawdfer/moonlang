import "server-only";
// The student's own profile (F-002, RN-023, RN-025). Always the signed-in user, never an id from the client.
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { studentProfile, user } from "@/db/schema";
import { recordAudit } from "@/server/audit";
import { auth } from "@/server/auth/auth";
import type { CurrentUser } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { canChangeDueDay, dueDayChangeAllowedFrom, LAST_ACCESS_TOUCH_MS } from "./situation";
import { assertContactAvailable, assertDueDayOption, PeopleError } from "./students";

export async function getOwnProfile(userId: string, now = new Date()) {
  const [row] = await db
    .select({
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      goal: studentProfile.goal,
      birthDate: studentProfile.birthDate,
      cefrLevel: studentProfile.cefrLevel,
      dueDay: studentProfile.dueDay,
      dueDayChangedAt: studentProfile.dueDayChangedAt,
    })
    .from(user)
    .innerJoin(studentProfile, eq(studentProfile.userId, user.id))
    .where(eq(user.id, userId));
  if (!row) return null;
  return {
    ...row,
    dueDayOptions: await getSetting("dueDayOptions"),
    canChangeDueDay: row.dueDay !== null && canChangeDueDay({ changedAt: row.dueDayChangedAt, now, isAdmin: false }),
    dueDayChangeFrom: dueDayChangeAllowedFrom(row.dueDayChangedAt),
  };
}

/**
 * The student edits name, phone, e-mail and goal (F-002, RN-023). Changing the
 * e-mail, which is also the password-recovery address, asks for the password.
 */
export async function updateOwnProfile(
  me: CurrentUser,
  input: { name: string; email: string; phoneNumber: string; goal: string | null; currentPassword: string },
  requestHeaders: Headers,
  now = new Date(),
) {
  await assertContactAvailable(input, me.id);
  if (input.email !== me.email) {
    const ok = await auth.api
      .verifyPassword({ body: { password: input.currentPassword }, headers: requestHeaders })
      .then((r) => r.status)
      .catch(() => false);
    if (!ok) throw new PeopleError("wrongPassword");
  }
  await db
    .update(user)
    .set({
      name: input.name,
      email: input.email,
      phoneNumber: input.phoneNumber,
      ...(input.email !== me.email ? { emailVerified: false } : {}),
      updatedAt: now,
    })
    .where(eq(user.id, me.id));
  await db.update(studentProfile).set({ goal: input.goal }).where(eq(studentProfile.userId, me.id));
}

/** RN-025: the student changes the due day at most once every 3 months. */
export async function changeOwnDueDay(me: CurrentUser, dueDay: number, now = new Date()) {
  const [profile] = await db.select().from(studentProfile).where(eq(studentProfile.userId, me.id));
  if (!profile) throw new PeopleError("notFound");
  if (profile.dueDay === null) throw new PeopleError("dueDayNotSet");
  if (!canChangeDueDay({ changedAt: profile.dueDayChangedAt, now, isAdmin: false })) {
    throw new PeopleError("dueDayTooSoon", {
      from: dueDayChangeAllowedFrom(profile.dueDayChangedAt)!.toISOString(),
    });
  }
  await assertDueDayOption(dueDay);
  if (dueDay === profile.dueDay) return;
  await db.update(studentProfile).set({ dueDay, dueDayChangedAt: now }).where(eq(studentProfile.userId, me.id));
  await recordAudit({
    actorId: me.id,
    action: "student.due_day_changed",
    entityType: "user",
    entityId: me.id,
    data: { from: profile.dueDay, to: dueDay },
  });
}

/**
 * Updates `last_access_at` (RN-021) with a single conditional statement that
 * writes at most once per hour; signing in again also reactivates the account.
 */
export async function touchLastAccess(userId: string, now = new Date()) {
  await db
    .update(studentProfile)
    .set({ lastAccessAt: now })
    .where(
      and(
        eq(studentProfile.userId, userId),
        or(
          isNull(studentProfile.lastAccessAt),
          lt(studentProfile.lastAccessAt, new Date(now.getTime() - LAST_ACCESS_TOUCH_MS)),
        ),
      ),
    );
}
