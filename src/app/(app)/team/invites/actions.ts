"use server";

import { revalidatePath } from "next/cache";
import { requireStaff } from "@/server/auth/session";
import { createInvite } from "@/server/people/invites";
import { createInviteSchema, fieldErrors } from "@/server/people/schemas";

export type CreateInviteState = {
  errors: Record<string, string>;
  created?: { url: string; whatsapp: string | null; emailed: boolean };
};

/** Staff create a 7-day, single-use invite (F-001, RN-020). */
export async function createInviteAction(
  _prev: CreateInviteState,
  formData: FormData,
): Promise<CreateInviteState> {
  const actor = await requireStaff();
  const parsed = createInviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const result = await createInvite(actor, parsed.data);
  revalidatePath("/team/invites");
  return {
    errors: {},
    created: { url: result.url, whatsapp: result.whatsapp, emailed: Boolean(parsed.data.email) },
  };
}
