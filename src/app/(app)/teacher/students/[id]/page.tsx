import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatBRL } from "@/lib/money";
import { isAdmin } from "@/server/auth/roles";
import { requireStaff } from "@/server/auth/session";
import { getSetting } from "@/server/settings";
import { getStudentForStaff, PeopleError } from "@/server/people/students";
import { SituationBadges } from "../_components/situation-badges";
import { keepAccountAction } from "./actions";
import { ContactAttemptForm, DueDayOverrideForm, RemoveAccountForm, StudentEditForm } from "./forms";

export const metadata: Metadata = { title: "Aluno", robots: { index: false } };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

/** Everything about one student (F-002, step 2). Private notes are staff-only. */
export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireStaff();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  let data: Awaited<ReturnType<typeof getStudentForStaff>>;
  try {
    data = await getStudentForStaff(actor, id);
  } catch (error) {
    if (error instanceof PeopleError) notFound();
    throw error;
  }
  const [t, format] = await Promise.all([getTranslations("people.profile"), getFormatter()]);
  const admin = isAdmin(actor.role);
  const dueDayOptions = admin ? await getSetting("dueDayOptions") : [];
  const { student, situation, retention } = data;
  const date = (d: Date) => format.dateTime(d, { dateStyle: "short" });
  const dateTime = (d: Date) => format.dateTime(d, { dateStyle: "short", timeStyle: "short" });
  const day = (s: string) => format.dateTime(new Date(`${s}T12:00:00Z`), { dateStyle: "short" });
  const empty = <p className="text-sm text-muted-foreground">{t("none")}</p>;

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-10">
      <Link href="/teacher/students" className="text-sm text-muted-foreground hover:underline">
        ← {t("back")}
      </Link>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl font-semibold">{student.name}</h1>
          <p className="text-sm text-muted-foreground">
            {student.lastAccessAt
              ? t("lastAccess", { date: dateTime(student.lastAccessAt) })
              : t("neverAccessed")}
          </p>
        </div>
        <SituationBadges status={situation.status} inactive={situation.inactive} />
      </header>
      {query.registered === "1" && (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          {t("registered")}
        </p>
      )}

      <Section title={t("dataTitle")}>
        <StudentEditForm
          studentId={student.id}
          values={{
            name: student.name,
            email: student.email,
            phoneNumber: student.phoneNumber ?? "",
            birthDate: student.birthDate,
            goal: student.goal ?? "",
            cefrLevel: student.cefrLevel ?? "",
            privateNotes: student.privateNotes ?? "",
          }}
        />
      </Section>

      <Section title={t("groupsTitle")}>
        {data.enrollments.length === 0
          ? empty
          : (
              <ul className="flex flex-col gap-2 text-sm">
                {data.enrollments.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2">
                    <Link href={`/teacher/classes/${e.classGroupId}`} className="font-medium hover:underline">
                      {e.groupName}
                    </Link>
                    <span className="text-muted-foreground">
                      {e.planName} · {formatBRL(e.priceOverrideCents ?? e.priceCents)} ·{" "}
                      {t(`enrollmentStatus.${e.status}`)} · {t("since", { date: day(e.startedOn) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        <p className="text-sm">
          {student.dueDay ? t("dueDay", { day: student.dueDay }) : t("dueDayNotSet")}
          {student.dueDayChangedAt && (
            <span className="text-muted-foreground"> · {t("dueDayChanged", { date: date(student.dueDayChangedAt) })}</span>
          )}
        </p>
        {admin && student.dueDay !== null && (
          <DueDayOverrideForm studentId={student.id} current={student.dueDay} options={dueDayOptions} />
        )}
      </Section>

      <Section title={t("upcomingTitle")}>
        {data.upcoming.length === 0
          ? empty
          : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.upcoming.slice(0, 8).map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span>{dateTime(l.startsAt)}</span>
                    <span className="text-muted-foreground">
                      {l.groupName ?? t(`lessonKind.${l.kind}`)} · {t(`lessonStatus.${l.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
      </Section>

      <Section title={t("historyTitle")}>
        {data.history.length === 0
          ? empty
          : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.history.map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <span>{dateTime(l.startsAt)}</span>
                    <span className="text-muted-foreground">
                      {l.groupName ?? t(`lessonKind.${l.kind}`)} ·{" "}
                      {l.attendance ? t(`attendance.${l.attendance}`) : t(`lessonStatus.${l.lessonStatus}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
      </Section>

      <Section title={t("creditsTitle")}>
        {data.credits.length === 0
          ? empty
          : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.credits.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span>{t(`creditKind.${c.kind}`)}</span>
                    <span className="text-muted-foreground">{t("expires", { date: date(c.expiresAt) })}</span>
                  </li>
                ))}
              </ul>
            )}
      </Section>

      <Section title={t("chargesTitle")}>
        {data.charges.length === 0
          ? empty
          : (
              <ul className="flex flex-col gap-1 text-sm">
                {data.charges.slice(0, 12).map((c) => (
                  <li key={c.id} className="flex justify-between gap-2">
                    <span>
                      {day(c.dueDate)} · {formatBRL(c.amountCents - c.discountCents)}
                    </span>
                    <span className="text-muted-foreground">
                      {c.groupName ?? t(`chargeKind.${c.kind}`)} · {t(`chargeStatus.${c.status}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
        <Link href="/teacher/finance" className="text-sm underline-offset-4 hover:underline">
          {t("openFinance")}
        </Link>
      </Section>

      <Section title={t("contactTitle")}>
        <p className="text-sm text-muted-foreground">{t("contactHint")}</p>
        {data.attempts.length > 0 && (
          <ul className="flex flex-col gap-2 text-sm">
            {data.attempts.map((a) => (
              <li key={a.id} className="rounded-lg bg-muted p-3">
                <p className="font-medium">
                  {dateTime(a.createdAt)} · {t(`channels.${a.channel}`)}
                  {a.outcome && ` · ${a.outcome}`}
                </p>
                {a.note && <p className="text-muted-foreground">{a.note}</p>}
                <p className="text-xs text-muted-foreground">{t("by", { name: a.byName })}</p>
              </li>
            ))}
          </ul>
        )}
        <ContactAttemptForm studentId={student.id} />
      </Section>

      {admin && (
        <Section title={t("accountTitle")}>
          {situation.inactive && (
            <p className="text-sm">
              {retention.due
                ? t("retentionDue")
                : t("retentionAt", { date: date(retention.dueAt) })}
            </p>
          )}
          {retention.due && (
            <form action={keepAccountAction.bind(null, student.id)}>
              <Button type="submit" variant="outline">
                {t("keep")}
              </Button>
            </form>
          )}
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-destructive">{t("removeTitle")}</summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">{t("removeHint")}</p>
              <RemoveAccountForm studentId={student.id} />
            </div>
          </details>
        </Section>
      )}
    </main>
  );
}
