import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/db";
import { toDateString } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/session";
import { type AgendaLesson, listAgendaLessons, listScheduleBlocks, syncSchedule } from "@/server/classes/lessons";
import {
  addDaysToDate,
  isBlocked,
  isDateString,
  toTimeString,
  weekdayOfDate,
  zonedDateTime,
} from "@/server/classes/rules";
import { TeacherNav } from "../classes/_components/teacher-nav";
import { WEEKDAYS, weekdayName } from "../classes/_components/weekday";

export async function generateMetadata() {
  const t = await getTranslations("agenda");
  return { title: t("title") };
}

const VIEWS = ["day", "week", "month"] as const;
type View = (typeof VIEWS)[number];

function firstOfMonth(date: string, monthOffset = 0): string {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + monthOffset, 1)).toISOString().slice(0, 10);
}

/** Days shown by each view; the week starts on Sunday. */
function visibleDays(view: View, date: string): string[] {
  let start = date;
  let count = 1;
  if (view === "week") {
    start = addDaysToDate(date, -weekdayOfDate(date));
    count = 7;
  } else if (view === "month") {
    const first = firstOfMonth(date);
    const last = addDaysToDate(firstOfMonth(date, 1), -1);
    start = addDaysToDate(first, -weekdayOfDate(first));
    const end = addDaysToDate(last, 6 - weekdayOfDate(last));
    count = Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1;
  }
  return Array.from({ length: count }, (_, i) => addDaysToDate(start, i));
}

function shift(view: View, date: string, direction: 1 | -1): string {
  if (view === "day") return addDaysToDate(date, direction);
  if (view === "week") return addDaysToDate(date, 7 * direction);
  return firstOfMonth(date, direction);
}

// Teacher agenda in day, week and month views (F-004).
export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  await requireStaff();
  const params = await searchParams;
  const t = await getTranslations("agenda");
  const format = await getFormatter();
  const now = new Date();
  await syncSchedule(db, now);

  const today = toDateString(now);
  const view: View = VIEWS.includes(params.view as View) ? (params.view as View) : "week";
  const date = params.date && isDateString(params.date) ? params.date : today;
  const days = visibleDays(view, date);
  const lessons = await listAgendaLessons(db, {
    from: zonedDateTime(days[0]!, "00:00"),
    to: zonedDateTime(addDaysToDate(days.at(-1)!, 1), "00:00"),
  });
  const blocks = await listScheduleBlocks(db, now);
  const byDay = new Map<string, AgendaLesson[]>();
  for (const lesson of lessons) {
    const day = toDateString(lesson.startsAt);
    byDay.set(day, [...(byDay.get(day) ?? []), lesson]);
  }

  const noon = (day: string) => zonedDateTime(day, "12:00");
  const href = (v: View, d: string) => `/teacher/agenda?view=${v}&date=${d}`;
  const heading =
    view === "day"
      ? format.dateTime(noon(date), { weekday: "long", day: "numeric", month: "long" })
      : view === "week"
        ? format.dateTimeRange(noon(days[0]!), noon(days.at(-1)!), { day: "numeric", month: "short" })
        : format.dateTime(noon(date), { month: "long", year: "numeric" });

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <TeacherNav current="agenda" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <div className="flex flex-wrap gap-2">
          <Link href="/teacher/agenda/trial/new" className={buttonVariants({ size: "sm", variant: "outline" })}>
            {t("trial.title")}
          </Link>
          <Link href="/teacher/agenda/new" className={buttonVariants({ size: "sm" })}>
            {t("newLesson")}
          </Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={href(view, shift(view, date, -1))} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <span aria-hidden>←</span>
            <span className="sr-only">{t("previous")}</span>
          </Link>
          <Link href={href(view, today)} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {t("today")}
          </Link>
          <Link href={href(view, shift(view, date, 1))} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <span aria-hidden>→</span>
            <span className="sr-only">{t("next")}</span>
          </Link>
          <h2 className="ml-2 font-display text-lg font-semibold first-letter:uppercase">{heading}</h2>
        </div>
        <div className="flex rounded-lg border bg-card p-1 text-sm">
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={href(v, date)}
              aria-current={v === view ? "page" : undefined}
              className={cn("rounded-md px-3 py-1", v === view ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              {t(`views.${v}`)}
            </Link>
          ))}
        </div>
      </div>

      {view === "day" && (
        <DayList
          lessons={byDay.get(date) ?? []}
          blocked={isBlocked(noon(date), blocks)}
          emptyText={t("emptyDay")}
          blockedText={t("blockedDay")}
        />
      )}

      {view === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((day) => (
            <section
              key={day}
              className={cn(
                "rounded-xl border bg-card p-3",
                day === today && "border-primary",
                isBlocked(noon(day), blocks) && "bg-muted",
              )}
            >
              <Link href={href("day", day)} className="mb-2 block text-sm font-semibold first-letter:uppercase hover:underline">
                {format.dateTime(noon(day), { weekday: "short", day: "2-digit", month: "2-digit" })}
              </Link>
              {isBlocked(noon(day), blocks) && <p className="mb-2 text-xs text-muted-foreground">{t("blockedDay")}</p>}
              <div className="flex flex-col gap-2">
                {(byDay.get(day) ?? []).map((lesson) => (
                  <LessonChip key={lesson.id} lesson={lesson} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {view === "month" && (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="grid grid-cols-7 border-b text-center text-xs font-semibold text-muted-foreground">
            {await Promise.all(
              WEEKDAYS.map(async (w) => (
                <div key={w} className="py-2 first-letter:uppercase">
                  {await weekdayName(w, "short")}
                </div>
              )),
            )}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const inMonth = day.slice(0, 7) === date.slice(0, 7);
              const dayLessons = byDay.get(day) ?? [];
              return (
                <Link
                  key={day}
                  href={href("day", day)}
                  className={cn(
                    "min-h-20 border-r border-b p-1.5 text-xs hover:bg-muted sm:min-h-24",
                    !inMonth && "text-muted-foreground opacity-60",
                    isBlocked(noon(day), blocks) && "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full",
                      day === today && "bg-primary text-primary-foreground",
                    )}
                  >
                    {Number(day.slice(8))}
                  </span>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {dayLessons.map((lesson) => (
                      <li
                        key={lesson.id}
                        className={cn("truncate", lesson.status.startsWith("cancelled") && "line-through opacity-60")}
                      >
                        <span className="font-semibold">{toTimeString(lesson.startsAt)}</span>{" "}
                        <span className="hidden sm:inline">{lesson.groupName ?? t(`kind.${lesson.kind}`)}</span>
                      </li>
                    ))}
                  </ul>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}

async function LessonChip({ lesson }: { lesson: AgendaLesson }) {
  const t = await getTranslations("agenda");
  const cancelled = lesson.status.startsWith("cancelled") || lesson.status === "rejected";
  return (
    <Link
      href={`/teacher/agenda/lessons/${lesson.id}`}
      className={cn(
        "block rounded-lg border-l-4 bg-muted px-2 py-1.5 text-sm hover:bg-muted/70",
        lesson.status === "done" ? "border-success" : "border-primary",
        cancelled && "border-muted-foreground opacity-60",
      )}
    >
      <p className={cn("font-semibold", cancelled && "line-through")}>
        {toTimeString(lesson.startsAt)} · {lesson.durationMinutes / 60}h
      </p>
      <p className="truncate">{lesson.groupName ?? t(`kind.${lesson.kind}`)}</p>
      <p className="truncate text-xs text-muted-foreground">
        {lesson.status !== "confirmed" ? t(`status.${lesson.status}`) : lesson.participants.map((p) => p.name).join(", ")}
      </p>
    </Link>
  );
}

function DayList({
  lessons,
  blocked,
  emptyText,
  blockedText,
}: {
  lessons: AgendaLesson[];
  blocked: boolean;
  emptyText: string;
  blockedText: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      {blocked && <p className="rounded-lg bg-muted p-3 text-sm">{blockedText}</p>}
      {lessons.length === 0 && <p className="text-muted-foreground">{emptyText}</p>}
      {lessons.map((lesson) => (
        <LessonChip key={lesson.id} lesson={lesson} />
      ))}
    </div>
  );
}
