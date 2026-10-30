import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UserPreferenceSwitchers } from "@/components/preferences";
import { buttonVariants } from "@/components/ui/button";

// Simple public page for MVP 1 (F-011). The full editable version comes in Phase 2.
export default async function HomePage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-4 py-20 text-center">
      {/* F-010: language and theme can be changed before signing in. */}
      <UserPreferenceSwitchers className="absolute top-4 right-4" />
      <span className="text-6xl" aria-hidden>
        🌙
      </span>
      <h1 className="font-display text-4xl font-semibold">{t("home.title")}</h1>
      <p className="text-lg text-muted-foreground">{t("home.subtitle")}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>
          {t("common.signIn")}
        </Link>
      </div>
    </main>
  );
}
