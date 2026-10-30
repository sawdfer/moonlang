"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/server/auth/session";
import { dueDaySchema, fieldErrors, ownProfileSchema } from "@/server/people/schemas";
import { changeOwnDueDay, updateOwnProfile } from "@/server/people/self";
import { PeopleError } from "@/server/people/students";

export type OwnProfileState = { errors: Record<string, string>; saved?: boolean; allowedFrom?: string };

/** The student edits their own data (F-002). The user always comes from the session. */
export async function updateOwnProfileAction(_prev: OwnProfileState, formData: FormData): Promise<OwnProfileState> {
  const me = await requireUser(["student", "trial"]);
  const parsed = ownProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  try {
    await updateOwnProfile(me, parsed.data, await headers());
  } catch (error) {
    if (error instanceof PeopleError) {
      return { errors: { [error.code === "wrongPassword" ? "currentPassword" : "form"]: error.code } };
    }
    throw error;
  }
  revalidatePath("/student/profile");
  return { errors: {}, saved: true };
}

/** RN-025: once every 3 months. */
export async function changeDueDayAction(_prev: OwnProfileState, formData: FormData): Promise<OwnProfileState> {
  const me = await requireUser(["student"]);
  const parsed = dueDaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: { form: "invalidDueDay" } };
  try {
    await changeOwnDueDay(me, parsed.data.dueDay);
  } catch (error) {
    if (error instanceof PeopleError) return { errors: { form: error.code }, allowedFrom: error.data?.from };
    throw error;
  }
  revalidatePath("/student/profile");
  return { errors: {}, saved: true };
}
