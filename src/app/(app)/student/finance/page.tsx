import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { toDateString } from "@/lib/dates";
import { formatBRL } from "@/lib/money";
import { requireUser } from "@/server/auth/session";
import { getOwnFinance } from "@/server/billing/queries";
import { parseDay } from "@/server/billing/rules";
import { getSetting } from "@/server/settings";
import { StatusBadge } from "../../teacher/finance/_components/status-badge";
import { CopyButton } from "./copy-button";

export const metadata: Metadata = { title: "Financeiro" };

/**
 * The student's own charges, due dates and the Pix key (RN-014). Blocked
 * students can still open it to settle their payments (RN-015).
 */
export default async function StudentFinancePage() {
  const me = await requireUser(["student", "trial"]);
  const [t, tKind, tBilling, format, finance, pixKey] = await Promise.all([
    getTranslations("billing.student"),
    getTranslations("billing.kind"),
    getTranslations("billing"),
    getFormatter(),
    getOwnFinance(me.id),
    getSetting("pixKey"),
  ]);
  const day = (d: string) => format.dateTime(parseDay(d), { day: "2-digit", month: "2-digit", year: "numeric" });

  // Trial accounts see this page once their plan has started (first charge), F-006/F-007.
  if (me.role === "trial" && finance.charges.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <Card className="text-center">
          <p className="font-display text-lg">{t("locked")}</p>
        </Card>
      </main>
    );
  }

  const open = finance.charges.filter((c) => c.status === "pending" || c.status === "overdue");
  const history = finance.charges.filter((c) => c.status === "paid");
  // Extra lessons are charged together with the monthly fee due the same day (RN-026).
  const byDueDate = Map.groupBy(open, (c) => c.dueDate);
  const dueDates = [...byDueDate.keys()].sort();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>

      {finance.blocked && (
        <p role="alert" className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {t("blocked")}
        </p>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">{t("pixTitle")}</h2>
        {pixKey ? (
          <div className="flex flex-wrap items-center gap-3">
            <code className="rounded-lg bg-muted px-3 py-2 text-base break-all">{pixKey}</code>
            <CopyButton value={pixKey} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("pixMissing")}</p>
        )}
        <p className="text-sm text-muted-foreground">{t("payHint")}</p>
      </Card>

      <section className="flex flex-col gap-3" aria-labelledby="open-title">
        <h2 id="open-title" className="font-display text-xl font-semibold">
          {t("open")}
        </h2>
        {dueDates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("openEmpty")}</p>
        ) : (
          dueDates.map((dueDate) => {
            const items = byDueDate.get(dueDate)!;
            const total = items.reduce((sum, c) => sum + c.amountCents, 0);
            return (
              <Card key={dueDate} className="flex flex-col gap-3 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{t("due", { date: day(dueDate) })}</p>
                  <StatusBadge status={items.some((c) => c.status === "overdue") ? "overdue" : "pending"} />
                </div>
                <ul className="flex flex-col gap-1 text-sm">
                  {items.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">
                        {tKind(c.kind)}
                        {c.groupName ? ` · ${c.groupName}` : ""}
                        {c.periodStart && c.periodEnd
                          ? ` · ${tBilling("period", { start: day(c.periodStart), end: day(c.periodEnd) })}`
                          : ""}
                      </span>
                      <span className="shrink-0">{formatBRL(c.amountCents)}</span>
                    </li>
                  ))}
                </ul>
                <p className="font-display text-lg font-semibold">{t("total", { amount: formatBRL(total) })}</p>
              </Card>
            );
          })
        )}
      </section>

      {history.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="history-title">
          <h2 id="history-title" className="font-display text-xl font-semibold">
            {t("history")}
          </h2>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {history.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
                <span>
                  {tKind(c.kind)}
                  {c.groupName ? ` · ${c.groupName}` : ""}
                  <span className="block text-muted-foreground">
                    {c.paidAt ? t("paidOn", { date: day(toDateString(c.paidAt)) }) : t("due", { date: day(c.dueDate) })}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {formatBRL(c.receivedCents ?? c.amountCents)}
                  <StatusBadge status="paid" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
