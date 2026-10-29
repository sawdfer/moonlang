import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { toDateString } from "@/lib/dates";
import { requireStaff } from "@/server/auth/session";
import { listClassGroups } from "@/server/classes/groups";
import { LESSON_DURATIONS } from "@/server/classes/rules";
import { ActionForm } from "../../classes/_components/action-form";
import { Field, Select } from "../../classes/_components/fields";
import { TeacherNav } from "../../classes/_components/teacher-nav";
import { createOneOffLessonAction } from "../actions";

export async function generateMetadata() {
  const t = await getTranslations("agenda");
  return { title: t("newLesson") };
}

// One-off lesson set by the teacher for a class group (F-004, RN-006).
export default async function NewLessonPage() {
  await requireStaff();
  const t = await getTranslations("agenda");
  const tc = await getTranslations("classes");
  const groups = (await listClassGroups(db)).filter((g) => !g.group.endsOn);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <TeacherNav current="agenda" />
      <h1 className="mb-2 font-display text-3xl font-semibold">{t("newLesson")}</h1>
      <p className="mb-6 text-muted-foreground">{t("newLessonHint")}</p>
      {groups.length === 0 ? (
        <p>
          {t("needGroup")}{" "}
          <Link href="/teacher/classes/new" className="font-medium underline">
            {tc("new")}
          </Link>
        </p>
      ) : (
        <Card>
          <ActionForm action={createOneOffLessonAction} submitLabel={t("createLesson")}>
            <Field label={t("group")} htmlFor="classGroupId">
              <Select id="classGroupId" name="classGroupId" required>
                {groups.map(({ group }) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t("date")} htmlFor="date">
                <Input id="date" name="date" type="date" min={toDateString(new Date())} required />
              </Field>
              <Field label={tc("fields.startTime")} htmlFor="time">
                <Input id="time" name="time" type="time" required />
              </Field>
              <Field label={tc("fields.duration")} htmlFor="durationMinutes">
                <Select id="durationMinutes" name="durationMinutes" defaultValue="60">
                  {LESSON_DURATIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {tc("durations", { hours: minutes / 60 })}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t("overrideLink")} htmlFor="meetingUrl" hint={t("overrideHint")}>
              <Input id="meetingUrl" name="meetingUrl" type="url" />
            </Field>
          </ActionForm>
        </Card>
      )}
    </main>
  );
}
