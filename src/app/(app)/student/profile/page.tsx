import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/server/auth/session";
import { getOwnProfile } from "@/server/people/self";
import { DueDayForm, OwnProfileForm } from "./forms";

export const metadata: Metadata = { title: "Meu perfil" };

/** The student's own data (F-002, RN-023). Private notes never appear here. */
export default async function OwnProfilePage() {
  const me = await requireUser(["student", "trial"]);
  const profile = await getOwnProfile(me.id);
  if (!profile) notFound();
  const [t, format] = await Promise.all([getTranslations("people.self"), getFormatter()]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <Card>
        <OwnProfileForm
          values={{
            name: profile.name,
            email: profile.email,
            phoneNumber: profile.phoneNumber ?? "",
            goal: profile.goal ?? "",
          }}
        />
      </Card>
      {me.role === "student" && profile.dueDay !== null && (
        <Card className="flex flex-col gap-3">
          <h2 className="font-display text-xl font-semibold">{t("dueDayTitle")}</h2>
          <p className="text-sm">{t("dueDayCurrent", { day: profile.dueDay })}</p>
          {profile.canChangeDueDay ? (
            <DueDayForm current={profile.dueDay} options={profile.dueDayOptions} />
          ) : (
            profile.dueDayChangeFrom && (
              <p className="text-sm text-muted-foreground">
                {t("dueDayFrom", { date: format.dateTime(profile.dueDayChangeFrom, { dateStyle: "long" }) })}
              </p>
            )
          )}
        </Card>
      )}
      <Card className="flex flex-col gap-2 text-sm">
        <p>{t("privacy")}</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/account/security" className="underline underline-offset-4">
            {t("security")}
          </Link>
          <Link href="/terms" className="underline underline-offset-4">
            {t("terms")}
          </Link>
        </div>
      </Card>
    </main>
  );
}
