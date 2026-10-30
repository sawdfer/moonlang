import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { db } from "@/db";
import { userPreference } from "@/db/schema";
import { getCurrentUser } from "@/server/auth/session";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./config";

/** Language saved in the signed-in user's account, used on a device without the cookie (F-010). */
async function savedLocale(): Promise<Locale | null> {
  const user = await getCurrentUser().catch(() => null);
  if (!user) return null;
  const [row] = await db
    .select({ locale: userPreference.locale })
    .from(userPreference)
    .where(eq(userPreference.userId, user.id));
  return row?.locale ?? null;
}

// Locale comes from a cookie (no locale prefix in URLs), then from the account,
// then Portuguese, the default (F-010).
export default getRequestConfig(async () => {
  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(stored) ? stored : ((await savedLocale()) ?? DEFAULT_LOCALE);
  return {
    locale,
    timeZone: "America/Sao_Paulo",
    messages: (await import(`../../messages/${locale}/index.ts`)).default,
  };
});
