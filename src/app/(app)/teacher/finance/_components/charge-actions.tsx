"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { markPaidAction, undoPaymentAction } from "../actions";
import { ActionError } from "./action-error";

/** Tap 1 opens the form already filled in; tap 2 confirms (F-007: at most 2 taps). */
export function MarkPaidButton({ chargeId, amount, today }: { chargeId: string; amount: string; today: string }) {
  const t = useTranslations("billing.teacher");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(markPaidAction, null);

  if (!open || state?.ok) {
    return (
      <Button size="sm" onClick={() => setOpen(true)} disabled={state?.ok}>
        {t("markPaid")}
      </Button>
    );
  }
  return (
    <form action={action} className="flex w-full flex-col gap-3 rounded-lg bg-muted p-3 sm:w-auto">
      <input type="hidden" name="chargeId" value={chargeId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`received-${chargeId}`}>{t("receivedAmount")}</Label>
          <Input id={`received-${chargeId}`} name="received" defaultValue={amount} inputMode="decimal" required />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`paidOn-${chargeId}`}>{t("paidDate")}</Label>
          <Input id={`paidOn-${chargeId}`} name="paidOn" type="date" defaultValue={today} max={today} required />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`note-${chargeId}`}>{t("note")}</Label>
        <Input id={`note-${chargeId}`} name="note" maxLength={500} />
      </div>
      <ActionError state={state} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {t("confirmPaid")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

/** Undo a payment marked by mistake, with a confirmation tap. */
export function UndoPaymentButton({ chargeId }: { chargeId: string }) {
  const t = useTranslations("billing.teacher");
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(undoPaymentAction, null);

  if (!confirming || state?.ok) {
    return (
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={state?.ok}>
        {t("undo")}
      </Button>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="chargeId" value={chargeId} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={pending}>
          {t("confirmUndo")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          {t("cancel")}
        </Button>
      </div>
      <ActionError state={state} />
    </form>
  );
}
