"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireStaff } from "@/server/auth/session";
import { recordContactAttempt } from "@/server/people/contact";
import { keepStudentAccount, removeStudentAccount } from "@/server/people/retention";
import {
  contactAttemptSchema,
  dueDaySchema,
  fieldErrors,
  removeStudentSchema,
  staffUpdateStudentSchema,
} from "@/server/people/schemas";
import { PeopleError, setDueDayByAdmin, updateStudentByStaff } from "@/server/people/students";

export type ProfileFormState = { errors: Record<string, string>; saved?: boolean; whatsappUrl?: string | null };

function failure(error: unknown, field = "form"): ProfileFormState {
  if (error instanceof PeopleError) return { errors: { [field]: error.code } };
  throw error;
}

const path = (id: string) => `/teacher/students/${id}`;

/** Staff edit data, level and private notes (F-002). */
export async function updateStudentAction(
  studentId: string,
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const actor = await requireStaff();
  const parsed = staffUpdateStudentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  try {
    await updateStudentByStaff(actor, studentId, parsed.data);
  } catch (error) {
    return failure(error, error instanceof PeopleError && error.code === "underage" ? "birthDate" : "form");
  }
  revalidatePath(path(studentId));
  return { errors: {}, saved: true };
}

/** Records a re-engagement attempt; WhatsApp attempts also prepare the message (F-002, F-008). */
export async function contactAttemptAction(
  studentId: string,
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const actor = await requireStaff();
  const parsed = contactAttemptSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  try {
    const { whatsappUrl } = await recordContactAttempt(actor, studentId, parsed.data);
    revalidatePath(path(studentId));
    return { errors: {}, saved: true, whatsappUrl };
  } catch (error) {
    return failure(error);
  }
}

/** RN-025 exception: admins change the due day at any time. */
export async function overrideDueDayAction(
  studentId: string,
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const actor = await requireAdmin();
  const parsed = dueDaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: { form: "invalidDueDay" } };
  try {
    await setDueDayByAdmin(actor, studentId, parsed.data.dueDay);
  } catch (error) {
    return failure(error);
  }
  revalidatePath(path(studentId));
  return { errors: {}, saved: true };
}

/** RN-021: keep the inactive account; a new notice comes in 6 months. */
export async function keepAccountAction(studentId: string): Promise<void> {
  const actor = await requireAdmin();
  await keepStudentAccount(actor, studentId);
  revalidatePath(path(studentId));
}

/** RN-021, RN-023: only admins remove accounts, with a confirmation and a reason. */
export async function removeAccountAction(
  studentId: string,
  _prev: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const actor = await requireAdmin();
  const parsed = removeStudentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  try {
    await removeStudentAccount(actor, studentId, parsed.data.reason);
  } catch (error) {
    return failure(error);
  }
  redirect("/teacher/students?removed=1");
}
