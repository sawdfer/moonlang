"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startPlanAction } from "../actions";
import { ActionError } from "./action-error";

/** Picks the due day and start date; the server creates the first prorated charge (RN-025). */
export function StartPlanForm({
  enrollmentId,
  dueDayOptions,
  lockedDueDay,
  defaultStartDate,
  canSkipProration,
}: {
  enrollmentId: string;
  dueDayOptions: number[];
  lockedDueDay: number | null;
  defaultStartDate: string;
  canSkipProration: boolean;
}) {
  const t = useTranslations("billing.teacher");
  const [state, action, pending] = useActionState(startPlanAction, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`dueDay-${enrollmentId}`}>{t("dueDay")}</Label>
          {lockedDueDay === null ? (
            <select
              id={`dueDay-${enrollmentId}`}
              name="dueDay"
              required
              className="h-11 rounded-lg border border-input bg-card px-3 text-base"
            >
              {dueDayOptions.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          ) : (
            <>
              <input type="hidden" name="dueDay" value={lockedDueDay} />
              <p className="flex h-11 items-center text-sm text-muted-foreground">
                {t("dueDayLocked", { day: lockedDueDay })}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`startDate-${enrollmentId}`}>{t("startDate")}</Label>
          <Input id={`startDate-${enrollmentId}`} name="startDate" type="date" defaultValue={defaultStartDate} required />
        </div>
      </div>
      {canSkipProration && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="existingStudent" className="mt-1" />
          {t("existingStudent")}
        </label>
      )}
      <ActionError state={state} />
      <Button type="submit" size="sm" disabled={pending} className="self-start">
        {t("startPlan")}
      </Button>
    </form>
  );
}
