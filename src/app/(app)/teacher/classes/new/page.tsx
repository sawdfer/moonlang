import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/session";
import { toDateString } from "@/lib/dates";
import { ActionForm } from "../_components/action-form";
import { ClassGroupFields } from "../_components/class-group-fields";
import { TeacherNav } from "../_components/teacher-nav";
import { createClassGroupAction } from "../actions";

export async function generateMetadata() {
  const t = await getTranslations("classes");
  return { title: t("new") };
}

export default async function NewClassGroupPage() {
  await requireStaff();
  const t = await getTranslations("classes");
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <TeacherNav current="classes" />
      <h1 className="mb-6 font-display text-3xl font-semibold">{t("new")}</h1>
      <Card>
        <ActionForm action={createClassGroupAction} submitLabel={t("create")}>
          <ClassGroupFields
            defaults={{
              name: "",
              lessonType: "conversation",
              cefrLevel: null,
              durationMinutes: 60,
              weekday: 1,
              startTime: "19:00",
              meetingUrl: null,
              startsOn: toDateString(new Date()),
            }}
          />
        </ActionForm>
      </Card>
    </main>
  );
}
