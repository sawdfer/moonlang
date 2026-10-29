"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/db";
import { userPreference } from "@/db/schema";
import { LOCALE_COOKIE, LOCALES } from "@/i18n/config";
import { getCurrentUser } from "@/server/auth/session";

// Language and theme preferences (F-010). Anyone can switch; signed-in users
// also get the choice saved to their account so it follows them across devices.

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;
const localeInput = z.enum(LOCALES);
const themeInput = z.enum(["system", "light", "dark"]);

export async function setLocalePreference(value: string): Promise<void> {
  const locale = localeInput.parse(value);
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  const user = await getCurrentUser();
  if (user) {
    await db
      .insert(userPreference)
      .values({ userId: user.id, locale })
      .onConflictDoUpdate({ target: userPreference.userId, set: { locale } });
  }
}

export async function setThemePreference(value: string): Promise<void> {
  const theme = themeInput.parse(value);
  const user = await getCurrentUser();
  if (!user) return;
  await db
    .insert(userPreference)
    .values({ userId: user.id, theme })
    .onConflictDoUpdate({ target: userPreference.userId, set: { theme } });
}
