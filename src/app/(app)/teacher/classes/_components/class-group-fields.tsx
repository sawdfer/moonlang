import { getTranslations } from "next-intl/server";
import { Input } from "@/components/ui/input";
import { cefrLevel, lessonType } from "@/db/schema";
import type { ClassGroupInput } from "@/server/classes/groups";
import { LESSON_DURATIONS } from "@/server/classes/rules";
import { Field, Select } from "./fields";
import { WEEKDAYS, weekdayName } from "./weekday";

/** Inputs of the class group form (F-003). */
export async function ClassGroupFields({
  defaults,
  durationLocked = false,
}: {
  defaults: ClassGroupInput;
  durationLocked?: boolean;
}) {
  const t = await getTranslations("classes");
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Field label={t("fields.name")} htmlFor="name">
          <Input id="name" name="name" defaultValue={defaults.name} maxLength={80} required />
        </Field>
      </div>
      <Field label={t("fields.lessonType")} htmlFor="lessonType">
        <Select id="lessonType" name="lessonType" defaultValue={defaults.lessonType}>
          {lessonType.enumValues.map((value) => (
            <option key={value} value={value}>
              {t(`lessonTypes.${value}`)}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("fields.cefrLevel")} htmlFor="cefrLevel">
        <Select id="cefrLevel" name="cefrLevel" defaultValue={defaults.cefrLevel ?? ""}>
          <option value="">{t("fields.noLevel")}</option>
          {cefrLevel.enumValues.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label={t("fields.duration")}
        htmlFor="durationMinutes"
        hint={durationLocked ? t("fields.durationLocked") : undefined}
      >
        {durationLocked && <input type="hidden" name="durationMinutes" value={defaults.durationMinutes} />}
        <Select
          id="durationMinutes"
          name={durationLocked ? undefined : "durationMinutes"}
          defaultValue={String(defaults.durationMinutes)}
          disabled={durationLocked}
        >
          {LESSON_DURATIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t("durations", { hours: minutes / 60 })}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t("fields.weekday")} htmlFor="weekday">
        <Select id="weekday" name="weekday" defaultValue={String(defaults.weekday)}>
          {await Promise.all(
            WEEKDAYS.map(async (day) => (
              <option key={day} value={day}>
                {await weekdayName(day)}
              </option>
            )),
          )}
        </Select>
      </Field>
      <Field label={t("fields.startTime")} htmlFor="startTime">
        <Input id="startTime" name="startTime" type="time" defaultValue={defaults.startTime.slice(0, 5)} required />
      </Field>
      <Field label={t("fields.startsOn")} htmlFor="startsOn">
        <Input id="startsOn" name="startsOn" type="date" defaultValue={defaults.startsOn} required />
      </Field>
      <div className="sm:col-span-2">
        <Field label={t("fields.meetingUrl")} htmlFor="meetingUrl" hint={t("fields.meetingUrlHint")}>
          <Input
            id="meetingUrl"
            name="meetingUrl"
            type="url"
            inputMode="url"
            placeholder="https://meet.google.com/…"
            defaultValue={defaults.meetingUrl ?? ""}
          />
        </Field>
      </div>
    </div>
  );
}
