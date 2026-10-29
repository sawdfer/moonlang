"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSettingsAction } from "./actions";

export function SettingsForm({
  pixKey,
  extraHourPrice,
  dueDayOptions,
}: {
  pixKey: string;
  extraHourPrice: string;
  dueDayOptions: string;
}) {
  const t = useTranslations("billing.admin");
  const [state, action, pending] = useActionState(saveSettingsAction, null);
  const typed = state && !state.ok ? state.values : null;

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <Label htmlFor="pixKey">{t("pixKey")}</Label>
        <Input id="pixKey" name="pixKey" defaultValue={typed?.pixKey ?? pixKey} maxLength={140} aria-describedby="pixKey-hint" />
        <p id="pixKey-hint" className="text-xs text-muted-foreground">
          {t("pixKeyHint")}
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="extraHourPrice">{t("extraHourPrice")}</Label>
        <Input id="extraHourPrice" name="extraHourPrice" defaultValue={typed?.extraHourPrice ?? extraHourPrice} inputMode="decimal" required />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="dueDayOptions">{t("dueDayOptions")}</Label>
        <Input
          id="dueDayOptions"
          name="dueDayOptions"
          defaultValue={typed?.dueDayOptions ?? dueDayOptions}
          required
          aria-describedby="dueDayOptions-hint"
        />
        <p id="dueDayOptions-hint" className="text-xs text-muted-foreground">
          {t("dueDayOptionsHint")}
        </p>
      </div>
      {state && (
        <p role="status" className={state.ok ? "text-sm text-success" : "text-sm text-destructive"}>
          {state.ok ? t("saved") : t("invalid")}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {t("save")}
      </Button>
    </form>
  );
}
