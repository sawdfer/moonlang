import Link from "next/link";
import { redirect } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { syncSchedule } from "@/server/classes/lessons";
import { lessonEndsAt } from "@/server/classes/rules";
import { listUpcomingLessonsForStudent } from "@/server/classes/student";
import { JoinArea } from "../_components/join-area";

// Target of lesson reminders (F-008). Only lessons of the signed-in student are found,
// so a guessed id never reveals another student's lesson or meeting link (RN-024).
export default async function StudentLessonPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ join?: string }>;
}) {
  const user = await requireUser(["student", "trial"]);
  const { id } = await params;
  const { join } = await searchParams;
  const now = new Date();
  await syncSchedule(db, now);

  const lessons = await listUpcomingLessonsForStudent(db, { id: user.id, role: user.role as "student" | "trial" }, now);
  const lesson = lessons.find((l) => l.id === id);
  if (!lesson) redirect("/student/lessons");

  const t = await getTranslations("studentLessons");
  const format = await getFormatter();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/student/lessons" className="text-sm text-muted-foreground hover:underline">
        ← {t("title")}
      </Link>
      <Card className="mt-4 border-primary">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary">
          {lesson.groupName ?? t(`kind.${lesson.kind}`)}
        </p>
        <p className="mt-1 font-display text-2xl font-semibold first-letter:uppercase">
          {format.dateTime(lesson.startsAt, { weekday: "long", day: "numeric", month: "long" })},{" "}
          {format.dateTimeRange(lesson.startsAt, lessonEndsAt(lesson), { hour: "2-digit", minute: "2-digit" })}
        </p>
        {lesson.status === "pending" && <p className="mt-2 text-sm text-muted-foreground">{t("pending")}</p>}
        {join && ["closed", "noLink", "notFound"].includes(join) && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            {t(`joinError.${join}`)}
          </p>
        )}
        {lesson.status.startsWith("cancelled") ? (
          <p className="mt-3 text-sm text-destructive">{t("cancelled")}</p>
        ) : (
          <JoinArea lesson={lesson} />
        )}
      </Card>
    </main>
  );
}
