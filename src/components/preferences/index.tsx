import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreference } from "@/db/schema";
import { getCurrentUser } from "@/server/auth/session";
import { PreferenceSwitchers } from "./switchers";

export { LanguageSwitcher, PreferenceSwitchers, ThemeSwitcher } from "./switchers";

/**
 * Language and theme switchers (F-010). For signed-in users the stored theme
 * is applied on load; anonymous visitors keep the choice in the browser.
 */
export async function UserPreferenceSwitchers({ className }: { className?: string }) {
  const user = await getCurrentUser();
  const [saved] = user
    ? await db.select({ theme: userPreference.theme }).from(userPreference).where(eq(userPreference.userId, user.id))
    : [];
  return <PreferenceSwitchers savedTheme={saved?.theme ?? null} className={className} />;
}
