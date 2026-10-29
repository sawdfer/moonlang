import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { syncSchedule } from "@/server/classes/lessons";
import { addDaysToDate, lessonEndsAt, zonedDateTime } from "@/server/classes/rules";
import {
  listClassGroupsForStudent,
  listUpcomingLessonsForStudent,
  type StudentLesson,
} from "@/server/classes/student";

export async function generateMetadata() {
  const t = await getTranslations("studentLessons");
  return { title: t("title") };
}

// Student home: upcoming lessons and the "join" button (F-004, RN-024).
// Lessons and links are filtered on the server by the signed-in user's own enrollments.
export default async function StudentHomePage() {
  const user = await requireUser(["student", "trial"]);
  const viewer = { id: user.id, role: user.role as "student" | "trial" };
  const t = await getTranslations("studentLessons");
  const tc = await getTranslations("classes");
  const format = await getFormatter();
  const now = new Date();
  await syncSchedule(db, now);

  const lessons = await listUpcomingLessonsForStudent(db, viewer, now);
  const groups = viewer.role === "student" ? await listClassGroupsForStudent(db, viewer.id) : [];
  const [next, ...later] = lessons.filter((l) => !l.status.startsWith("cancelled"));
  const cancelled = lessons.filter((l) => l.status.startsWith("cancelled"));

  const when = (lesson: StudentLesson) =>
    `${format.dateTime(lesson.startsAt, { weekday: "long", day: "numeric", month: "long" })}, ${format.dateTimeRange(
      lesson.startsAt,
      lessonEndsAt(lesson),
      { hour: "2-digit", minute: "2-digit" },
    )}`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">{t("greeting", { name: user.name.split(" ")[0]! })}</h1>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-xl font-semibold">{t("nextLesson")}</h2>
        {!next ? (
          <Card>
            <p className="text-muted-foreground">{t("none")}</p>
          </Card>
        ) : (
          <Card className="border-primary">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">
              {next.groupName ?? t(`kind.${next.kind}`)}
            </p>
            <p className="mt-1 font-display text-2xl font-semibold first-letter:uppercase">{when(next)}</p>
            <JoinArea lesson={next} />
          </Card>
        )}
      </section>

      {later.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">{t("upcoming")}</h2>
          <ul className="flex flex-col gap-2">
            {later.map((lesson) => (
              <li key={lesson.id} className="rounded-lg border bg-card p-3">
                <p className="font-medium first-letter:uppercase">{when(lesson)}</p>
                <p className="text-sm text-muted-foreground">
                  {lesson.groupName ?? t(`kind.${lesson.kind}`)}
                  {lesson.status === "pending" && ` · ${t("pending")}`}
                </p>
                <JoinArea lesson={lesson} compact />
              </li>
            ))}
          </ul>
        </section>
      )}

      {cancelled.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">{t("cancelled")}</h2>
          <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
            {cancelled.map((lesson) => (
              <li key={lesson.id} className="first-letter:uppercase">
                <span className="line-through">{when(lesson)}</span> · {lesson.groupName ?? t(`kind.${lesson.kind}`)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {groups.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-xl font-semibold">{t("myGroups")}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <Card key={group.id} className="p-4">
                <p className="font-display text-lg font-semibold">{group.name}</p>
                <p className="text-sm text-muted-foreground first-letter:uppercase">
                  {tc("slot", {
                    weekday: format.dateTime(zonedDateTime(addDaysToDate("2026-11-01", group.weekday), "12:00"), {
                      weekday: "long",
                    }),
                    time: group.startTime,
                    hours: group.durationMinutes / 60,
                  })}
                </p>
                <p className="mt-2 text-sm">
                  {tc(`lessonTypes.${group.lessonType}`)}
                  {group.cefrLevel && ` · ${group.cefrLevel}`}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {group.classmates.length > 0
                    ? t("classmates", { names: group.classmates.join(", ") })
                    : t("individual")}
                </p>
                {group.blocked && <p className="mt-2 text-sm text-destructive">{t("blocked")}</p>}
              </Card>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

/**
 * The meeting link is only rendered here, when the server allowed it for this
 * student (RN-015, RN-024). It never goes to notifications or e-mails.
 */
async function JoinArea({ lesson, compact = false }: { lesson: StudentLesson; compact?: boolean }) {
  const t = await getTranslations("studentLessons");
  if (lesson.blocked) {
    return <p className="mt-3 text-sm text-destructive">{t("blocked")}</p>;
  }
  if (!lesson.meetingUrl) {
    if (lesson.status === "confirmed" && !compact) {
      return <p className="mt-3 text-sm text-muted-foreground">{t("linkSoon")}</p>;
    }
    return null;
  }
  return (
    <a
      href={lesson.meetingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ size: compact ? "sm" : "lg", variant: compact ? "outline" : "primary" }), "mt-3")}
    >
      {t("join")} 🌙
    </a>
  );
}
