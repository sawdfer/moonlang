"use server";

import { redirect } from "next/navigation";
import { requireStaff } from "@/server/auth/session";
import { BillingError } from "@/server/billing";
import { ClassesError } from "@/server/classes/lessons";
import { registerStudent } from "@/server/people/registration";
import { fieldErrors, registerStudentSchema } from "@/server/people/schemas";
import { PeopleError } from "@/server/people/students";

export type RegisterStudentState = { errors: Record<string, string> };

/** Manual registration (F-002). The person gets an e-mail to choose their password. */
export async function registerStudentAction(
  _prev: RegisterStudentState,
  formData: FormData,
): Promise<RegisterStudentState> {
  const actor = await requireStaff();
  const parsed = registerStudentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  let id: string;
  try {
    id = await registerStudent(actor, parsed.data);
  } catch (error) {
    if (error instanceof PeopleError) {
      return { errors: { [error.code === "underage" ? "birthDate" : "form"]: error.code } };
    }
    if (error instanceof BillingError || error instanceof ClassesError) {
      return { errors: { form: "placementFailed" } };
    }
    throw error;
  }
  redirect(`/teacher/students/${id}?registered=1`);
}
