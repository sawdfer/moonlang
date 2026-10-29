import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { requireStaff } from "@/server/auth/session";
import { listClassGroups } from "@/server/classes/groups";
import { MAX_STUDENTS_PER_GROUP, zonedDateTime } from "@/server/classes/rules";
import { TeacherNav } from "./_components/teacher-nav";
import { weekdayName } from "./_components/weekday";

export async function generateMetadata() {
  const t = await getTranslations("classes");
  return { title: t("title") };
}

// Class groups of the teacher (F-003).
export default async function ClassGroupsPage() {
  await requireStaff();
  const t = await getTranslations("classes");
  const format = await getFormatter();
  const groups = await listClassGroups(db);
  const active = groups.filter((g) => !g.group.endsOn);
  const ended = groups.filter((g) => g.group.endsOn);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <TeacherNav current="classes" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <Link href="/teacher/classes/new" className={buttonVariants({ size: "sm" })}>
          {t("new")}
        </Link>
      </div>

      {active.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {await Promise.all(
          active.map(async ({ group, students }) => (
            <Link key={group.id} href={`/teacher/classes/${group.id}`} className="block">
              <Card className="h-full transition-colors hover:border-primary">
                <p className="font-display text-xl font-semibold">{group.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("slot", {
                    weekday: await weekdayName(group.weekday),
                    time: group.startTime.slice(0, 5),
                    hours: group.durationMinutes / 60,
                  })}
                </p>
                <p className="mt-3 text-sm">
                  {t(`lessonTypes.${group.lessonType}`)}
                  {group.cefrLevel && ` · ${group.cefrLevel}`}
                  {" · "}
                  {t("studentCount", { count: students, max: MAX_STUDENTS_PER_GROUP })}
                </p>
              </Card>
            </Link>
          )),
        )}
      </div>

      {ended.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-display text-xl font-semibold">{t("ended")}</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {ended.map(({ group }) => (
              <li key={group.id}>
                <Link href={`/teacher/classes/${group.id}`} className="underline-offset-4 hover:underline">
                  {group.name}
                </Link>
                <span className="text-muted-foreground"> · {t("endedOn", { date: format.dateTime(zonedDateTime(group.endsOn!, "12:00"), { dateStyle: "short" }) })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
