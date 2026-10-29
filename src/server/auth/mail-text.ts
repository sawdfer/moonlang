import "server-only";
// Translated e-mail texts for F-001, usable outside a page request
// (e.g. inside Better Auth callbacks).
import { eq } from "drizzle-orm";
import { createTranslator } from "next-intl";
import { db } from "@/db";
import { userPreference } from "@/db/schema";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";
import en from "../../../messages/en";
import ptBR from "../../../messages/pt-BR";

const MESSAGES = { "pt-BR": ptBR, en } as const;

export function mailTranslator(locale: Locale = DEFAULT_LOCALE) {
  return createTranslator({ locale, messages: MESSAGES[locale], namespace: "auth.mail" });
}

/** The user's chosen language, or Portuguese when no preference is saved (F-010). */
export async function localeOf(userId: string): Promise<Locale> {
  const [row] = await db
    .select({ locale: userPreference.locale })
    .from(userPreference)
    .where(eq(userPreference.userId, userId));
  return isLocale(row?.locale) ? row.locale : DEFAULT_LOCALE;
}
