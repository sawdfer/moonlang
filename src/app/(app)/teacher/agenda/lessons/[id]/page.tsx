import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { toDateString } from "@/lib/dates";
import { requireStaff } from "@/server/auth/session";
import { getLessonDetail, syncSchedule } from "@/server/classes/lessons";
import { LATE_TOLERANCE_MINUTES, lessonEndsAt } from "@/server/classes/rules";
import { ActionForm } from "../../../classes/_components/action-form";
import { Field, Select } from "../../../classes/_components/fields";
import { TeacherNav } from "../../../classes/_components/teacher-nav";
import { cefrLevel, trialOutcome } from "@/db/schema";
import { getTrialRecord } from "@/server/classes/trial";
import {
  cancelLessonAction,
  recordTrialOutcomeAction,
  setAttendanceAction,
  setLessonMeetingUrlAction,
} from "../../actions";

export async function generateMetadata() {
  const t = await getTranslations("agenda");
  return { title: t("title") };
}

// One lesson: participants, attendance, cancellation and meeting link (F-004).
export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const now = new Date();
  await syncSchedule(db, now);
  const detail = await getLessonDetail(db, id);
  if (!detail) notFound();
  const { lesson, groupName, groupMeetingUrl, participants } = detail;
  const t = await getTranslations("agenda");
  const tc = await getTranslations("classes");
  const format = await getFormatter();

  const open = lesson.status === "pending" || lesson.status === "confirmed";
  const started = lesson.startsAt <= now;
  const canMark = started && (lesson.status === "confirmed" || lesson.status === "done");
  const meetingUrl = lesson.meetingUrl ?? groupMeetingUrl;
  const trial = lesson.kind === "trial" ? await getTrialRecord(db, lesson.id) : null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <TeacherNav current="agenda" />
      <Link href={`/teacher/agenda?view=day&date=${toDateString(lesson.startsAt)}`} className="text-sm text-muted-foreground hover:underline">
        ← {t("backToAgenda")}
      </Link>
      <h1 className="mt-2 font-display text-3xl font-semibold first-letter:uppercase">
        {format.dateTime(lesson.startsAt, { weekday: "long", day: "numeric", month: "long" })}
      </h1>
      <p className="mt-1 text-muted-foreground">
        {format.dateTimeRange(lesson.startsAt, lessonEndsAt(lesson), { hour: "2-digit", minute: "2-digit" })}
        {" · "}
        {t(`kind.${lesson.kind}`)}
        {" · "}
        <span className="font-semibold text-foreground">{t(`status.${lesson.status}`)}</span>
      </p>
      {groupName && lesson.classGroupId && (
        <p className="mt-1">
          <Link href={`/teacher/classes/${lesson.classGroupId}`} className="font-medium hover:underline">
            {groupName}
          </Link>
        </p>
      )}

      <Card className="mt-6">
        <h2 className="mb-1 font-display text-xl font-semibold">{t("attendance")}</h2>
        {(canMark || open) && (
          <p className="mb-4 text-sm text-muted-foreground">
            {canMark ? t("attendanceHint", { minutes: LATE_TOLERANCE_MINUTES }) : t("attendanceLater")}
          </p>
        )}
        {participants.length === 0 && <p className="text-sm text-muted-foreground">{t("noParticipants")}</p>}
        <ul className="flex flex-col divide-y">
          {participants.map((p) => (
            <li key={p.studentId} className="flex flex-col gap-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{p.name}</span>
                <span className="text-sm text-muted-foreground">
                  {p.attendance ? t(`attendanceStatus.${p.attendance}`) : t("attendanceStatus.expected")}
                </span>
              </div>
              {canMark && (
                <ActionForm action={setAttendanceAction} submitLabel={t("saveAttendance")} variant="outline" className="gap-2">
                  <input type="hidden" name="lessonId" value={lesson.id} />
                  <input type="hidden" name="studentId" value={p.studentId} />
                  <div className="grid grid-cols-2 gap-2">
                    <Select name="mark" aria-label={t("attendance")} defaultValue={p.attendance === "absent" ? "absent" : p.attendance === "late_absent" ? "late" : "present"}>
                      <option value="present">{t("marks.present")}</option>
                      <option value="late">{t("marks.late")}</option>
                      <option value="absent">{t("marks.absent")}</option>
                    </Select>
                    <Input
                      name="minutesLate"
                      type="number"
                      min={0}
                      max={240}
                      inputMode="numeric"
                      placeholder={t("minutesLate")}
                      aria-label={t("minutesLate")}
                    />
                  </div>
                </ActionForm>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {trial && (
        <Card className="mt-6">
          <h2 className="mb-1 font-display text-xl font-semibold">{t("trial.outcomeTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {started ? t("trial.outcomeHint") : t("trial.outcomeLater")}
          </p>
          {started && (
            <ActionForm action={recordTrialOutcomeAction} submitLabel={tc("save")} variant="outline">
              <input type="hidden" name="lessonId" value={lesson.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={tc("fields.cefrLevel")} htmlFor="cefrLevel">
                  <Select id="cefrLevel" name="cefrLevel" defaultValue={trial.cefrLevel ?? ""}>
                    <option value="">{tc("fields.noLevel")}</option>
                    {cefrLevel.enumValues.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t("trial.outcome")} htmlFor="outcome">
                  <Select id="outcome" name="outcome" defaultValue={trial.outcome}>
                    {trialOutcome.enumValues.map((value) => (
                      <option key={value} value={value}>
                        {t(`trial.outcomes.${value}`)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label={t("trial.notes")} htmlFor="notes">
                <textarea
                  id="notes"
                  name="notes"
                  maxLength={1000}
                  rows={3}
                  defaultValue={trial.notes ?? ""}
                  className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base"
                />
              </Field>
            </ActionForm>
          )}
          {trial.outcome === "converted" && <p className="mt-3 text-sm">{t("trial.convertHint")}</p>}
        </Card>
      )}

      <Card className="mt-6">
        <h2 className="mb-1 font-display text-xl font-semibold">{t("meetingLink")}</h2>
        <p className="mb-4 break-all text-sm text-muted-foreground">
          {meetingUrl ?? t("noMeetingLink")}
          {lesson.meetingUrl && ` (${t("lessonOverride")})`}
        </p>
        {open && (
          <ActionForm action={setLessonMeetingUrlAction} submitLabel={tc("save")} variant="outline">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <Field label={t("overrideLink")} htmlFor="meetingUrl" hint={t("overrideHint")}>
              <Input id="meetingUrl" name="meetingUrl" type="url" defaultValue={lesson.meetingUrl ?? ""} />
            </Field>
          </ActionForm>
        )}
      </Card>

      {open && (
        <Card className="mt-6">
          <h2 className="mb-1 font-display text-xl font-semibold">{t("cancel")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {lesson.kind === "trial" || lesson.kind === "extra" ? t("cancelHintNoCredit") : t("cancelHint")}
          </p>
          <ActionForm
            action={cancelLessonAction}
            submitLabel={t("cancel")}
            variant="destructive"
            confirmText={t("cancelConfirm")}
          >
            <input type="hidden" name="lessonId" value={lesson.id} />
          </ActionForm>
        </Card>
      )}
    </main>
  );
}
