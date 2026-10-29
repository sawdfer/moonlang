import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { setting } from "@/db/schema";
import { recordAudit } from "@/server/audit";
import { isAdmin } from "@/server/auth/roles";
import { getSetting } from "@/server/settings";
import { type Actor, BillingError } from "./index";

/** Billing settings the admin can change (RN-016, RN-025, RN-026, F-007). */
export const billingSettingsSchema = z.object({
  pixKey: z.string().trim().max(140).nullable(),
  extraHourPriceCents: z.number().int().positive().max(1_000_000),
  // Up to 28 so every month has the day.
  dueDayOptions: z
    .array(z.number().int().min(1).max(28))
    .min(1)
    .max(28)
    .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
});

export type BillingSettings = z.infer<typeof billingSettingsSchema>;

export async function getBillingSettings(): Promise<BillingSettings> {
  const [pixKey, extraHourPriceCents, dueDayOptions] = await Promise.all([
    getSetting("pixKey"),
    getSetting("extraHourPriceCents"),
    getSetting("dueDayOptions"),
  ]);
  return { pixKey, extraHourPriceCents, dueDayOptions };
}

export async function updateBillingSettings(actor: Actor, input: BillingSettings) {
  if (!isAdmin(actor.role)) throw new BillingError("forbidden");
  const next = billingSettingsSchema.parse(input);
  const previous = await getBillingSettings();
  for (const key of ["pixKey", "extraHourPriceCents", "dueDayOptions"] as const) {
    const value = next[key] || null;
    if (JSON.stringify(value) === JSON.stringify(previous[key])) continue;
    if (value === null) {
      // An empty Pix key falls back to the default (unset).
      await db.delete(setting).where(eq(setting.key, key));
    } else {
      await db
        .insert(setting)
        .values({ key, value, updatedById: actor.id })
        .onConflictDoUpdate({ target: setting.key, set: { value, updatedById: actor.id } });
    }
    await recordAudit({
      actorId: actor.id,
      action: "setting.updated",
      entityType: "setting",
      entityId: key,
      data: { from: previous[key], to: value },
    });
  }
}
