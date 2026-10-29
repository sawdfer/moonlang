import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { toDateString } from "@/lib/dates";
import { requireStaff } from "@/server/auth/session";
import { getClassGroupDetail, listPlansForDuration, listStudents } from "@/server/classes/groups";
import { listAgendaLessons, syncSchedule } from "@/server/classes/lessons";
import { MAX_STUDENTS_PER_GROUP, zonedDateTime } from "@/server/classes/rules";
import { formatBRL } from "@/lib/money";
import { ActionForm } from "../_components/action-form";
import { ClassGroupFields } from "../_components/class-group-fields";
import { Field, Select } from "../_components/fields";
import { TeacherNav } from "../_components/teacher-nav";
import { weekdayName } from "../_components/weekday";
import {
  endClassGroupAction,
  enrollStudentAction,
  removeEnrollmentAction,
  updateClassGroupAction,
} from "../actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const detail = await getClassGroupDetail(db, (await params).id);
  return { title: detail?.group.name };
}

export default async function ClassGroupPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const detail = await getClassGroupDetail(db, id);
  if (!detail) notFound();
  const { group, students } = detail;
  const t = await getTranslations("classes");
  const ta = await getTranslations("agenda");
  const format = await getFormatter();

  const now = new Date();
  await syncSchedule(db, now);
  const upcoming = (
    await listAgendaLessons(db, { from: now, to: new Date(now.getTime() + 35 * 24 * 3600 * 1000) })
  )
    .filter((l) => l.classGroupId === group.id)
    .slice(0, 5);

  const shortDate = (date: string) => format.dateTime(zonedDateTime(date, "12:00"), { dateStyle: "short" });
  const ended = group.endsOn !== null;
  const full = students.length >= MAX_STUDENTS_PER_GROUP;
  const enrolledIds = new Set(students.map((s) => s.studentId));
  const candidates = ended || full ? [] : (await listStudents(db)).filter((s) => !enrolledIds.has(s.id));
  const plans = ended || full ? [] : await listPlansForDuration(db, group.durationMinutes);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <TeacherNav current="classes" />
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold">{group.name}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("slot", {
            weekday: await weekdayName(group.weekday),
            time: group.startTime.slice(0, 5),
            hours: group.durationMinutes / 60,
          })}
          {ended && ` · ${t("endedOn", { date: shortDate(group.endsOn!) })}`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-4 font-display text-xl font-semibold">
              {t("students")} ({students.length}/{MAX_STUDENTS_PER_GROUP})
            </h2>
            {students.length === 0 && <p className="text-sm text-muted-foreground">{t("noStudents")}</p>}
            <ul className="flex flex-col divide-y">
              {students.map((s) => (
                <li key={s.enrollmentId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("enrollmentInfo", { plan: s.planName, date: shortDate(s.startedOn) })}
                      {s.status === "blocked" && ` · ${t("blocked")}`}
                    </p>
                  </div>
                  {!ended && (
                    <ActionForm
                      action={removeEnrollmentAction}
                      submitLabel={t("remove")}
                      variant="ghost"
                      confirmText={t("removeConfirm", { name: s.name })}
                    >
                      <input type="hidden" name="enrollmentId" value={s.enrollmentId} />
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>

            {!ended && full && <p className="mt-4 text-sm text-muted-foreground">{t("full")}</p>}
            {!ended && !full && (
              <div className="mt-4 border-t pt-4">
                <h3 className="mb-3 font-semibold">{t("enroll")}</h3>
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noCandidates")}</p>
                ) : (
                  <ActionForm action={enrollStudentAction} submitLabel={t("enroll")}>
                    <input type="hidden" name="classGroupId" value={group.id} />
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label={t("fields.student")} htmlFor="studentId">
                        <Select id="studentId" name="studentId" required>
                          {candidates.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.role === "trial" ? t("trialCandidate", { name: c.name }) : c.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t("fields.plan")} htmlFor="planId">
                        <Select id="planId" name="planId" required>
                          {plans.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {formatBRL(p.priceCents)}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label={t("fields.startedOn")} htmlFor="startedOn">
                        <Input
                          id="startedOn"
                          name="startedOn"
                          type="date"
                          defaultValue={toDateString(now)}
                          required
                        />
                      </Field>
                    </div>
                  </ActionForm>
                )}
              </div>
            )}
          </Card>

          {!ended && (
            <Card>
              <h2 className="mb-4 font-display text-xl font-semibold">{t("edit")}</h2>
              <ActionForm action={updateClassGroupAction} submitLabel={t("save")}>
                <input type="hidden" name="id" value={group.id} />
                <ClassGroupFields defaults={group} hasStudents={students.length > 0} />
              </ActionForm>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Card>
            <h2 className="mb-3 font-display text-lg font-semibold">{t("upcoming")}</h2>
            {upcoming.length === 0 && <p className="text-sm text-muted-foreground">{t("noUpcoming")}</p>}
            <ul className="flex flex-col gap-2 text-sm">
              {upcoming.map((l) => (
                <li key={l.id}>
                  <Link href={`/teacher/agenda/lessons/${l.id}`} className="hover:underline">
                    {format.dateTime(l.startsAt, {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Link>
                  {l.status !== "confirmed" && (
                    <span className="text-muted-foreground"> · {ta(`status.${l.status}`)}</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
          {!ended && (
            <Card>
              <h2 className="mb-2 font-display text-lg font-semibold">{t("end")}</h2>
              <p className="mb-3 text-sm text-muted-foreground">{t("endHint")}</p>
              <ActionForm
                action={endClassGroupAction}
                submitLabel={t("end")}
                variant="destructive"
                confirmText={t("endConfirm", { name: group.name })}
              >
                <input type="hidden" name="id" value={group.id} />
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}
