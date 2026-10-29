import "server-only";
// Staff accounts created by root and admins (F-001).
import { randomBytes } from "node:crypto";
import { asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/schema";
import { recordAudit } from "@/server/audit";
import { canCreateStaff } from "@/server/auth/access";
import { auth, WELCOME_RESET_PATH } from "@/server/auth/auth";
import { createUserWithPassword } from "@/server/auth/create-user";
import { STAFF_ROLES } from "@/server/auth/roles";
import type { CurrentUser } from "@/server/auth/session";

export async function listStaff() {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
    })
    .from(user)
    .where(inArray(user.role, [...STAFF_ROLES]))
    .orderBy(asc(user.createdAt));
}

/**
 * Creates an admin or teacher account. The new person never receives a
 * password from anyone: the account gets a random one and an e-mail link to
 * choose their own. Two-factor enrollment is required on first access.
 */
export async function createStaffAccount(
  actor: CurrentUser,
  input: { name: string; email: string; phoneNumber: string | null; role: "admin" | "teacher" },
): Promise<{ ok: true } | { ok: false; error: "forbidden" | "taken" }> {
  if (!canCreateStaff(actor.role, input.role)) return { ok: false, error: "forbidden" };

  const conditions = [eq(user.email, input.email)];
  if (input.phoneNumber) conditions.push(eq(user.phoneNumber, input.phoneNumber));
  const [existing] = await db.select({ id: user.id }).from(user).where(or(...conditions));
  if (existing) return { ok: false, error: "taken" };

  const created = await createUserWithPassword({
    name: input.name,
    email: input.email,
    password: randomBytes(32).toString("base64url"),
    role: input.role,
    phoneNumber: input.phoneNumber ?? undefined,
  });
  await recordAudit({
    actorId: actor.id,
    action: "staff.create",
    entityType: "user",
    entityId: created.id,
    data: { role: input.role },
  });
  await auth.api.requestPasswordReset({
    body: { email: input.email, redirectTo: WELCOME_RESET_PATH },
  });
  return { ok: true };
}
