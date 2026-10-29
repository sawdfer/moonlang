import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { touchLastAccess } from "@/server/people/self";
import { latestConsentVersion } from "@/server/people/store";
import { needsConsent } from "@/server/people/rules";
import { TERMS_VERSION } from "@/server/people/terms";
import { accessGate, GATE_PATHS } from "./access";
import { auth } from "./auth";
import { ADMIN_ROLES, homePathFor, type Role, STAFF_ROLES } from "./roles";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
};

/**
 * Reads the session once per request (Data Access Layer).
 * Returns a narrow user object: never pass the raw session to the client.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, role, twoFactorEnabled } = session.user;
  return {
    id,
    name,
    email,
    role: role as Role,
    twoFactorEnabled: Boolean(twoFactorEnabled),
  };
});

/** RN-023: whether the user still has to accept the current terms. */
/** RN-021: records the access of students (at most one write per hour, once per request). */
const recordAccess = cache(async (userId: string, role: Role) => {
  if (role === "student" || role === "trial") await touchLastAccess(userId);
});

export const hasPendingConsent = cache(async (userId: string, role: Role): Promise<boolean> => {
  if (!needsConsent(role, null, TERMS_VERSION)) return false;
  return needsConsent(role, await latestConsentVersion(db, userId), TERMS_VERSION);
});

/**
 * Requires a signed-in user without checking the access gates. Only for the
 * pages that resolve a gate (two-factor enrollment, consent) and sign-out.
 */
export async function requireSignedIn(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Requires a signed-in user, optionally with one of the given roles.
 * Staff without two-factor and students with an outdated consent are sent to
 * the page that fixes it before they can use anything else (F-001, RN-023).
 */
export async function requireUser(
  allowed?: readonly Role[],
): Promise<CurrentUser> {
  const user = await requireSignedIn();
  const gate = accessGate({
    role: user.role,
    twoFactorEnabled: user.twoFactorEnabled,
    needsConsent: await hasPendingConsent(user.id, user.role),
  });
  await recordAccess(user.id, user.role);
  if (gate) redirect(GATE_PATHS[gate]);
  // Wrong role: send the user to their own area instead of exposing the page.
  if (allowed && !allowed.includes(user.role)) redirect(homePathFor(user.role));
  return user;
}

export const requireStaff = () => requireUser(STAFF_ROLES);
export const requireAdmin = () => requireUser(ADMIN_ROLES);
