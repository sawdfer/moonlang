import type { Metadata } from "next";
import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireStaff } from "@/server/auth/session";
import { runRetentionReview } from "@/server/people/retention";
import { STUDENT_FILTERS, type StudentFilter } from "@/server/people/situation";
import { listGroupsForFilter, listStudentsForStaff } from "@/server/people/students";
import { SituationBadges } from "./_components/situation-badges";

export const metadata: Metadata = { title: "Alunos" };

function parseFilter(value: unknown): StudentFilter {
  return STUDENT_FILTERS.includes(value as StudentFilter) ? (value as StudentFilter) : "all";
}

/** Student list with filters by situation and class group (F-002, step 1). */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireStaff();
  const params = await searchParams;
  const filter = parseFilter(params.filter);
  const groupId = typeof params.group === "string" && params.group ? params.group : null;
  const now = new Date();

  // Idempotent: inactivity and retention notices (RN-021). The daily cron should call it too.
  await runRetentionReview(now);
  const [t, format, students, groups] = await Promise.all([
    getTranslations("people.list"),
    getFormatter(),
    listStudentsForStaff(actor, { filter, classGroupId: groupId }, now),
    listGroupsForFilter(actor),
  ]);
  const query = (f: StudentFilter) => {
    const search = new URLSearchParams();
    if (f !== "all") search.set("filter", f);
    if (groupId) search.set("group", groupId);
    const text = search.toString();
    return text ? `/teacher/students?${text}` : "/teacher/students";
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <Link href="/teacher/students/new" className={buttonVariants({ size: "sm" })}>
          {t("register")}
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <nav aria-label={t("filtersLabel")} className="flex flex-wrap gap-2 text-sm">
          {STUDENT_FILTERS.map((f) => (
            <Link
              key={f}
              href={query(f)}
              aria-current={filter === f ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 hover:bg-muted",
                filter === f && "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {t(`filters.${f}`)}
            </Link>
          ))}
        </nav>
        {groups.length > 0 && (
          <form className="flex flex-wrap items-center gap-2 text-sm" method="get">
            {filter !== "all" && <input type="hidden" name="filter" value={filter} />}
            <label htmlFor="group">{t("groupLabel")}</label>
            <select
              id="group"
              name="group"
              defaultValue={groupId ?? ""}
              className="h-9 rounded-lg border border-input bg-card px-2"
            >
              <option value="">{t("allGroups")}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <button type="submit" className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("apply")}
            </button>
          </form>
        )}
      </div>

      {students.length === 0 ? (
        <p className="text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {students.map((s) => (
            <li key={s.id}>
              <Link
                href={`/teacher/students/${s.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted"
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {s.name}
                    {s.cefrLevel && <span className="ml-2 text-xs text-muted-foreground">{s.cefrLevel}</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {s.groups.filter((g) => g.status !== "dropped").map((g) => g.name).join(", ") || t("noGroup")}
                    {" · "}
                    {s.lastAccessAt
                      ? t("lastAccess", { date: format.dateTime(s.lastAccessAt, { dateStyle: "short" }) })
                      : t("neverAccessed")}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {s.retentionDue && (
                    <span className="text-xs font-semibold text-destructive">{t("retentionDue")}</span>
                  )}
                  <SituationBadges status={s.status} inactive={s.inactive} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
