"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dropoutAction } from "../actions";
import { ActionError } from "./action-error";

/** Registers a drop-out after a confirmation step (RN-027). */
export function DropoutButton({ enrollmentId }: { enrollmentId: string }) {
  const t = useTranslations("billing.teacher");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(dropoutAction, null);

  if (!open) {
    return (
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
        {t("dropout")}
      </Button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-2 sm:w-auto">
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <Input name="reason" placeholder={t("dropoutReason")} aria-label={t("dropoutReason")} maxLength={500} />
      <ActionError state={state} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {t("confirmDropout")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
