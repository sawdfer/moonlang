"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { createStaffSchema, fieldErrors } from "@/server/people/schemas";
import { createStaffAccount } from "@/server/people/staff";

export type CreateStaffState = { errors: Record<string, string>; created?: string };

/** Root creates admins and teachers; admins create teachers (F-001). */
export async function createStaffAction(
  _prev: CreateStaffState,
  formData: FormData,
): Promise<CreateStaffState> {
  const actor = await requireAdmin();
  const parsed = createStaffSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const result = await createStaffAccount(actor, parsed.data);
  if (!result.ok) return { errors: { form: result.error } };
  revalidatePath("/team/staff");
  return { errors: {}, created: parsed.data.email };
}
