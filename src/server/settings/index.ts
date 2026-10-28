import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { setting } from "@/db/schema";
import { DEFAULT_SETTINGS, type SettingKey, type Settings } from "./defaults";

export { DEFAULT_SETTINGS } from "./defaults";
export type { SettingKey, Settings } from "./defaults";

/** Reads one admin-configurable setting, falling back to its default. */
export async function getSetting<K extends SettingKey>(key: K): Promise<Settings[K]> {
  const [row] = await db.select().from(setting).where(eq(setting.key, key));
  return (row?.value as Settings[K] | undefined) ?? DEFAULT_SETTINGS[key];
}
