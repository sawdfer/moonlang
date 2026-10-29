"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/auth/session";
import { parseDayList, parseReaisToCents } from "@/server/billing/form";
import { billingSettingsSchema, updateBillingSettings } from "@/server/billing/settings";

/** On error, the typed values come back so the form does not lose them when React resets it. */
export type SettingsResult =
  | { ok: true }
  | { ok: false; values: { pixKey: string; extraHourPrice: string; dueDayOptions: string } }
  | null;

export async function saveSettingsAction(_prev: SettingsResult, form: FormData): Promise<SettingsResult> {
  const actor = await requireAdmin();
  const values = {
    pixKey: String(form.get("pixKey") ?? ""),
    extraHourPrice: String(form.get("extraHourPrice") ?? ""),
    dueDayOptions: String(form.get("dueDayOptions") ?? ""),
  };
  const parsed = billingSettingsSchema.safeParse({
    pixKey: values.pixKey.trim() || null,
    extraHourPriceCents: parseReaisToCents(values.extraHourPrice),
    dueDayOptions: parseDayList(values.dueDayOptions),
  });
  if (!parsed.success) return { ok: false, values };
  await updateBillingSettings(actor, parsed.data);
  revalidatePath("/admin/settings");
  return { ok: true };
}
