import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
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

/** Requires a signed-in user, optionally with one of the given roles. */
export async function requireUser(
  allowed?: readonly Role[],
): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Wrong role: send the user to their own area instead of exposing the page.
  if (allowed && !allowed.includes(user.role)) redirect(homePathFor(user.role));
  return user;
}

export const requireStaff = () => requireUser(STAFF_ROLES);
export const requireAdmin = () => requireUser(ADMIN_ROLES);
