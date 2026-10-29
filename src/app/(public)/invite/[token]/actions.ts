"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { assertPasswordAllowed, PasswordPolicyError } from "@/server/auth/create-user";
import { homePathFor } from "@/server/auth/roles";
import { acceptInvite } from "@/server/people/invites";
import { acceptInviteSchema, fieldErrors } from "@/server/people/schemas";

export type AcceptInviteState = { errors: Record<string, string> };

/** Creates the account from an invite and signs the person in (F-001). */
export async function acceptInviteAction(
  token: string,
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const parsed = acceptInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const input = parsed.data;

  try {
    await assertPasswordAllowed(input.password);
  } catch (error) {
    if (error instanceof PasswordPolicyError) {
      return { errors: { password: `password_${error.reason}` } };
    }
    throw error;
  }

  const result = await acceptInvite(token, input);
  if (!result.ok) {
    const field = result.error === "underage" ? "birthDate" : "form";
    return { errors: { [field]: result.error } };
  }

  await auth.api.signInEmail({
    body: { email: result.email, password: input.password },
    headers: await headers(),
  });
  redirect(homePathFor(result.role));
}
