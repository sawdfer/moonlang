import { MessageCircle, Video } from "lucide-react";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { FunMessage } from "@/components/fun";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { STAFF_BAND } from "@/i18n/fun";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { isAdmin } from "@/server/auth/roles";
import { requireStaff } from "@/server/auth/session";
import { syncSchedule } from "@/server/classes/lessons";
import { loadDashboard } from "@/server/dashboard/queries";

export async function generateMetadata() {
  const t = await getTranslations("dashboard");
  return { title: t("title") };
}

const MAX_CHARGES = 8;

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-xl font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// Teacher dashboard, MVP 1 part (F-009): everything she needs today, without a click.
export default async function TeacherDashboardPage() {
  const user = await requireStaff();
  const now = new Date();
  // Materializes this week's lessons, as the agenda does (F-004).
  await syncSchedule(db, now);
  const [t, format, data] = await Promise.all([
    getTranslations("dashboard"),
    getFormatter(),
    loadDashboard(db, { id: user.id, role: user.role }, now),
  ]);

  const time = (date: Date) => format.dateTime(date, { hour: "2-digit", minute: "2-digit" });
  const day = (date: Date) => format.dateTime(date, { weekday: "short", day: "2-digit", month: "2-digit" });
  // `date` columns are calendar days: format them at noon São Paulo time so they never shift.
  const calendarDay = (value: string) => format.dateTime(new Date(`${value}T12:00:00-03:00`), { day: "2-digit", month: "2-digit" });
  const visibleCharges = data.charges.slice(0, MAX_CHARGES);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8">
      <header>
        <h1 className="font-display text-3xl font-semibold">{t("greeting", { name: user.name.split(" ")[0]! })}</h1>
        <p className="mt-1 text-muted-foreground first-letter:uppercase">
          {t("today", { date: format.dateTime(now, { weekday: "long", day: "numeric", month: "long" }) })}
        </p>
      </header>

      {/* 1. Today's lessons */}
      <Section title={t("todayLessons")}>
        {data.todayLessons.length === 0 ? (
          <Card className="flex items-center gap-4">
            <span className="text-4xl" aria-hidden>
              🌙
            </span>
            <FunMessage messageKey="noLessonsToday" band={STAFF_BAND} className="text-base" />
          </Card>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {data.todayLessons.map((l) => (
              <li key={l.id}>
                <Card className={cn("flex h-full flex-col gap-3 p-5", l.status === "done" && "opacity-70")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-2xl font-semibold">
                        {format.dateTimeRange(l.startsAt, new Date(l.startsAt.getTime() + l.durationMinutes * 60_000), {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                      <p className="font-semibold">{l.groupName ?? t("individual")}</p>
                    </div>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                      {t(`kind.${l.kind}`)} · {t(`status.${l.status}`)}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {l.participants.length > 0 ? l.participants.join(", ") : t("participants", { count: 0 })}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {l.status !== "done" &&
                      (l.meetingUrl ? (
                        // RN-024: the meeting link is only shown inside the platform, to staff here.
                        <a
                          href={l.meetingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={buttonVariants({ variant: "primary" })}
                        >
                          <Video className="size-4" aria-hidden />
                          {t("join")}
                        </a>
                      ) : (
                        <span className="self-center text-sm text-muted-foreground">{t("noLink")}</span>
                      ))}
                    <Link href={`/teacher/agenda/lessons/${l.id}`} className={buttonVariants({ variant: "outline" })}>
                      {t("details")}
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 2. Pending lesson requests */}
      <Section title={t("requests")}>
        {data.requests.length === 0 ? (
          <Card className="p-4">
            <FunMessage messageKey="noRequests" band={STAFF_BAND} />
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3">
                <div>
                  <p className="font-semibold first-letter:uppercase">
                    {day(r.startsAt)}, {time(r.startsAt)} · {t(`kind.${r.kind}`)}
                  </p>
                  {r.requestedBy && (
                    <p className="text-sm text-muted-foreground">{t("requestedBy", { name: r.requestedBy })}</p>
                  )}
                </div>
                <Link href={`/teacher/agenda/lessons/${r.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  {t("review")}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* 3. New students and first payments */}
      <Section title={t("people")}>
        <div className="grid gap-3 md:grid-cols-2">
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("newStudents")}</h3>
            {data.newStudents.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noNewStudents")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {data.newStudents.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      {s.name}
                      {s.role === "trial" && (
                        <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-accent-foreground">
                          {t("trial")}
                        </span>
                      )}
                    </span>
                    {s.joinedAt && (
                      <span className="text-muted-foreground">{t("joinedOn", { date: day(s.joinedAt) })}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 text-sm font-semibold">{t("awaitingFirstPayment")}</h3>
            {data.firstPayments.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("noAwaitingFirstPayment")}</p>
            ) : (
              <ul className="flex flex-col gap-1.5 text-sm">
                {data.firstPayments.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{c.studentName}</span>
                    <span className={c.state === "overdue" ? "font-semibold text-destructive" : "text-muted-foreground"}>
                      {formatBRL(c.amountCents)} · {t("dueOn", { date: calendarDay(c.dueDate) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </Section>

      {/* 4. Pending and overdue charges */}
      <Section
        title={t("charges")}
        action={
          <Link href="/teacher/finance" className="text-sm font-semibold text-primary hover:underline">
            {t("seeAllCharges")}
          </Link>
        }
      >
        {data.charges.length === 0 ? (
          <Card className="p-4">
            <FunMessage messageKey="noOpenCharges" band={STAFF_BAND} />
          </Card>
        ) : (
          <Card className="p-4">
            <p className="mb-3 text-sm font-semibold">
              {t("chargesSummary", {
                open: data.chargesSummary.open,
                overdue: data.chargesSummary.overdue,
                total: formatBRL(data.chargesSummary.totalCents),
              })}
            </p>
            <ul className="flex flex-col divide-y text-sm">
              {visibleCharges.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">{c.studentName}</span>
                  <span className="flex items-center gap-2">
                    <span>{formatBRL(c.amountCents)}</span>
                    <span className="text-muted-foreground">{t("dueOn", { date: calendarDay(c.dueDate) })}</span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        c.state === "overdue" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
                      )}
                    >
                      {t(c.state)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {data.charges.length > MAX_CHARGES && (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("moreCharges", { count: data.charges.length - MAX_CHARGES })}
              </p>
            )}
          </Card>
        )}
      </Section>

      {/* 5. WhatsApp queue */}
      <Section title={t("whatsapp")}>
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex items-center gap-2 font-semibold">
            <MessageCircle className="size-5 text-primary" aria-hidden />
            {data.whatsapp === 0 ? (
              <FunMessage messageKey="emptyQueue" band={STAFF_BAND} className="font-normal" />
            ) : (
              t("whatsappCount", { count: data.whatsapp })
            )}
          </div>
          {data.whatsapp > 0 && (
            <Link href="/teacher/whatsapp" className={buttonVariants({ variant: "primary", size: "sm" })}>
              {t("openQueue")}
            </Link>
          )}
        </Card>
      </Section>

      {isAdmin(user.role) && (
        <Section title={t("adminShortcuts")}>
          <div>
            <Link href="/admin/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("settings")}
            </Link>
          </div>
        </Section>
      )}

      <p className="text-sm text-muted-foreground">{t("metricsSoon")}</p>
    </main>
  );
}
