import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { toDateString } from "@/lib/dates";
import { requireStaff } from "@/server/auth/session";
import { listTrialUsers } from "@/server/classes/trial";
import { ActionForm } from "../../../classes/_components/action-form";
import { Field, Select } from "../../../classes/_components/fields";
import { TeacherNav } from "../../../classes/_components/teacher-nav";
import { scheduleTrialLessonAction } from "../../actions";

export async function generateMetadata() {
  const t = await getTranslations("agenda.trial");
  return { title: t("title") };
}

// Trial lesson for a person invited with a trial invite (F-006, RN-018).
export default async function NewTrialLessonPage() {
  await requireStaff();
  const t = await getTranslations("agenda.trial");
  const ta = await getTranslations("agenda");
  const tc = await getTranslations("classes");
  const people = await listTrialUsers(db);

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <TeacherNav current="agenda" />
      <h1 className="mb-2 font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("hint")}</p>
      {people.length === 0 ? (
        <p>
          {t("noPeople")}{" "}
          <Link href="/team/invites" className="font-medium underline">
            {t("invite")}
          </Link>
        </p>
      ) : (
        <Card>
          <ActionForm action={scheduleTrialLessonAction} submitLabel={t("create")}>
            <Field label={t("person")} htmlFor="userId">
              <Select id="userId" name="userId" required>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.email}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={ta("date")} htmlFor="date">
                <Input id="date" name="date" type="date" min={toDateString(new Date())} required />
              </Field>
              <Field label={tc("fields.startTime")} htmlFor="time" hint={t("duration")}>
                <Input id="time" name="time" type="time" required />
              </Field>
            </div>
            <Field label={tc("fields.meetingUrl")} htmlFor="meetingUrl" hint={tc("fields.meetingUrlHint")}>
              <Input id="meetingUrl" name="meetingUrl" type="url" placeholder="https://meet.google.com/…" required />
            </Field>
          </ActionForm>
        </Card>
      )}
    </main>
  );
}
