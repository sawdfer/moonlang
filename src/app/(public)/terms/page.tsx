import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { TERMS_VERSION } from "@/server/people/terms";

export const metadata: Metadata = { title: "Termos e privacidade" };

const SECTIONS = ["recording", "data", "sharing", "storage", "rights", "changes"] as const;

/** Recording term and privacy policy, versioned (RN-023, RN-028). Linked from every footer. */
export default async function TermsPage() {
  const [t, format] = await Promise.all([getTranslations("auth.terms"), getFormatter()]);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-16">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("version", {
            date: format.dateTime(new Date(`${TERMS_VERSION}T12:00:00Z`), { dateStyle: "long" }),
          })}
        </p>
      </header>
      {SECTIONS.map((section) => (
        <section key={section} className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-semibold">{t(`${section}.title`)}</h2>
          <p className="leading-relaxed text-muted-foreground">{t(`${section}.body`)}</p>
        </section>
      ))}
    </main>
  );
}
