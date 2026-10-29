"use server";

import { homePathFor } from "@/server/auth/roles";
import { getCurrentUser } from "@/server/auth/session";

/** Where the signed-in user lands after login (the role comes from the session, never the client). */
export async function homePathAction(): Promise<string> {
  const user = await getCurrentUser();
  return user ? homePathFor(user.role) : "/login";
}
