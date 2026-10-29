import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { toDateString } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/session";
import {
  type ChargeFilter,
  listChargesForStaff,
  listOpenEnrollments,
  listPlansToStart,
} from "@/server/billing/queries";
import { parseDay } from "@/server/billing/rules";
import { getBillingSettings } from "@/server/billing/settings";
import { MarkPaidButton, UndoPaymentButton } from "./_components/charge-actions";
import { DropoutButton } from "./_components/dropout-button";
import { StartPlanForm } from "./_components/start-plan-form";
import { StatusBadge } from "./_components/status-badge";

export const metadata: Metadata = { title: "Financeiro" };

const FILTERS: ChargeFilter[] = ["open", "overdue", "paid", "all"];

/** Teacher finance (F-007): charges by status, payments, plan start and drop-outs. */
export default async function TeacherFinancePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const actor = await requireStaff();
  const { status } = await searchParams;
  const filter = FILTERS.includes(status as ChargeFilter) ? (status as ChargeFilter) : "open";

  const [t, tBilling, tKind, tEnrollment, format, charges, toStart, enrollments, settings] = await Promise.all([
    getTranslations("billing.teacher"),
    getTranslations("billing"),
    getTranslations("billing.kind"),
    getTranslations("billing.enrollmentStatus"),
    getFormatter(),
    listChargesForStaff(actor, filter),
    listPlansToStart(actor),
    listOpenEnrollments(actor),
    getBillingSettings(),
  ]);
  const today = toDateString(new Date());
  const day = (d: string) => format.dateTime(parseDay(d), { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
      <header>
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>

      <section className="flex flex-col gap-4" aria-labelledby="charges-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="charges-title" className="font-display text-xl font-semibold">
            {t("charges")}
          </h2>
          <nav className="flex gap-1 rounded-lg bg-muted p-1">
            {FILTERS.map((f) => (
              <Link
                key={f}
                href={f === "open" ? "/teacher/finance" : `/teacher/finance?status=${f}`}
                aria-current={f === filter ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  f === filter ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(`filter.${f}`)}
              </Link>
            ))}
          </nav>
        </div>

        {charges.length === 0 ? (
          <Card className="text-center text-muted-foreground">{t("empty")}</Card>
        ) : (
          <ul className="flex flex-col gap-3">
            {charges.map(({ charge: c, status: s, studentName, groupName }) => (
              <li key={c.id}>
                <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{studentName}</span>
                      <StatusBadge status={s} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {tKind(c.kind)}
                      {groupName ? ` · ${groupName}` : ""}
                      {c.periodStart && c.periodEnd
                        ? ` · ${tBilling("period", { start: day(c.periodStart), end: day(c.periodEnd) })}`
                        : ""}
                    </p>
                    <p className="text-sm">
                      <span className="font-display text-lg font-semibold">{formatBRL(c.amountCents)}</span>{" "}
                      · {s === "paid" && c.paidAt ? t("paidOn", { date: day(toDateString(c.paidAt)) }) : t("due", { date: day(c.dueDate) })}
                    </p>
                    {s === "paid" && c.receivedCents !== null && c.receivedCents !== c.amountCents && (
                      <p className="text-sm text-destructive">
                        {t("received", { amount: formatBRL(c.receivedCents) })} ·{" "}
                        {t("difference", { amount: formatBRL(c.receivedCents - c.amountCents) })}
                      </p>
                    )}
                    {c.note && <p className="text-sm text-muted-foreground">“{c.note}”</p>}
                  </div>
                  <div className="sm:shrink-0">
                    {(s === "pending" || s === "overdue") && (
                      <MarkPaidButton
                        chargeId={c.id}
                        amount={(c.amountCents / 100).toFixed(2).replace(".", ",")}
                        today={today}
                      />
                    )}
                    {s === "paid" && <UndoPaymentButton chargeId={c.id} />}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="start-title">
        <div>
          <h2 id="start-title" className="font-display text-xl font-semibold">
            {t("startTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("startHint")}</p>
        </div>
        {toStart.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("startEmpty")}</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {toStart.map((e) => (
              <li key={e.enrollmentId}>
                <Card className="flex flex-col gap-3 p-4">
                  <div>
                    <p className="font-semibold">{e.studentName}</p>
                    <p className="text-sm text-muted-foreground">
                      {e.groupName} · {t("monthlyPrice", { plan: e.planName, price: formatBRL(e.monthlyPriceCents) })}
                    </p>
                  </div>
                  <StartPlanForm
                    enrollmentId={e.enrollmentId}
                    dueDayOptions={settings.dueDayOptions}
                    lockedDueDay={e.dueDay}
                    defaultStartDate={e.startedOn > today ? e.startedOn : today}
                    canSkipProration={e.studentRole === "student"}
                  />
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="enrollments-title">
        <h2 id="enrollments-title" className="font-display text-xl font-semibold">
          {t("enrollmentsTitle")}
        </h2>
        {enrollments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("enrollmentsEmpty")}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {enrollments.map((e) => (
              <li key={e.enrollmentId} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-semibold">{e.studentName}</p>
                  <p className="text-sm text-muted-foreground">
                    {e.groupName} · {e.planName} ·{" "}
                    <span className={e.status === "blocked" ? "font-semibold text-destructive" : undefined}>
                      {tEnrollment(e.status)}
                    </span>
                  </p>
                </div>
                <DropoutButton enrollmentId={e.enrollmentId} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
