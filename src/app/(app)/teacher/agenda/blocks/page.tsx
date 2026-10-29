import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { db } from "@/db";
import { toDateString } from "@/lib/dates";
import { requireStaff } from "@/server/auth/session";
import { listScheduleBlocks } from "@/server/classes/lessons";
import { zonedDateTime } from "@/server/classes/rules";
import { ActionForm } from "../../classes/_components/action-form";
import { Field } from "../../classes/_components/fields";
import { TeacherNav } from "../../classes/_components/teacher-nav";
import { createScheduleBlockAction } from "../actions";

export async function generateMetadata() {
  const t = await getTranslations("agenda.blocks");
  return { title: t("title") };
}

// Vacation and holidays on the teacher's agenda (F-004, RN-011).
export default async function ScheduleBlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ cancelled?: string }>;
}) {
  await requireStaff();
  const { cancelled } = await searchParams;
  const t = await getTranslations("agenda.blocks");
  const format = await getFormatter();
  const now = new Date();
  const today = toDateString(now);
  const blocks = await listScheduleBlocks(db, now);
  const noon = (day: string) => zonedDateTime(day, "12:00");

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <TeacherNav current="blocks" />
      <h1 className="mb-2 font-display text-3xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("hint")}</p>

      {cancelled !== undefined && /^\d+$/.test(cancelled) && (
        <p role="status" className="mb-6 rounded-lg bg-success/15 p-3 text-sm">
          {t("created", { count: Number(cancelled) })}
        </p>
      )}

      <Card>
        <ActionForm action={createScheduleBlockAction} submitLabel={t("create")} confirmText={t("confirm")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("startsOn")} htmlFor="startsOn">
              <Input id="startsOn" name="startsOn" type="date" min={today} required />
            </Field>
            <Field label={t("endsOn")} htmlFor="endsOn">
              <Input id="endsOn" name="endsOn" type="date" min={today} required />
            </Field>
          </div>
          <Field label={t("reason")} htmlFor="reason">
            <Input id="reason" name="reason" maxLength={120} placeholder={t("reasonPlaceholder")} />
          </Field>
        </ActionForm>
      </Card>

      <h2 className="mt-10 mb-3 font-display text-xl font-semibold">{t("list")}</h2>
      {blocks.length === 0 && <p className="text-muted-foreground">{t("empty")}</p>}
      <ul className="flex flex-col gap-2">
        {blocks.map((block) => (
          <li key={block.id} className="rounded-lg border bg-card p-3">
            <p className="font-medium">
              {format.dateTimeRange(noon(block.startsOn), noon(block.endsOn), {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
            {block.reason && <p className="text-sm text-muted-foreground">{block.reason}</p>}
            {block.endsOn < today && <p className="text-xs text-muted-foreground">{t("past")}</p>}
          </li>
        ))}
      </ul>
    </main>
  );
}
