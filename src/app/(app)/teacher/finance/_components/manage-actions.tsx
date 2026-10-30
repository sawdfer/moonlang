"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  type ActionResult,
  addChargeAction,
  cancelChargeAction,
  editChargeAction,
  unblockAction,
} from "../actions";
import { ActionError } from "./action-error";

type Action = (prev: ActionResult, form: FormData) => Promise<ActionResult>;

/**
 * A button that opens a small form with a required reason (RN-012, V7).
 * Hidden fields identify the record; `children` adds the other inputs.
 */
function ReasonForm({
  id,
  label,
  confirmLabel,
  action,
  hidden,
  variant = "outline",
  destructive = false,
  children,
}: {
  id: string;
  label: string;
  confirmLabel: string;
  action: Action;
  hidden: Record<string, string>;
  variant?: "outline" | "ghost";
  destructive?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("billing.teacher");
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, null);

  if (!open || state?.ok) {
    return (
      <Button size="sm" variant={variant} onClick={() => setOpen(true)} disabled={state?.ok}>
        {label}
      </Button>
    );
  }
  return (
    <form action={formAction} className="flex w-full flex-col gap-3 rounded-lg bg-muted p-3 sm:w-80">
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`reason-${id}`}>{t("reason")}</Label>
        <Input id={`reason-${id}`} name="reason" required maxLength={500} />
      </div>
      <ActionError state={state} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant={destructive ? "destructive" : "primary"} disabled={pending}>
          {confirmLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} {...props} />
    </div>
  );
}

/** Teacher or admin unblocks despite overdue charges (RN-015, V7). */
export function UnblockButton({ enrollmentId }: { enrollmentId: string }) {
  const t = useTranslations("billing.teacher");
  return (
    <ReasonForm
      id={`unblock-${enrollmentId}`}
      label={t("unblock")}
      confirmLabel={t("confirmUnblock")}
      action={unblockAction}
      hidden={{ enrollmentId }}
    />
  );
}

/** Admin only (V7). */
export function CancelChargeButton({ chargeId }: { chargeId: string }) {
  const t = useTranslations("billing.teacher");
  return (
    <ReasonForm
      id={`cancel-${chargeId}`}
      label={t("cancelCharge")}
      confirmLabel={t("confirmCancelCharge")}
      action={cancelChargeAction}
      hidden={{ chargeId }}
      variant="ghost"
      destructive
    />
  );
}

/** Admin only (V7): amount and due date, overdue charges included. */
export function EditChargeButton({ chargeId, amount, dueDate }: { chargeId: string; amount: string; dueDate: string }) {
  const t = useTranslations("billing.teacher");
  return (
    <ReasonForm
      id={`edit-${chargeId}`}
      label={t("edit")}
      confirmLabel={t("save")}
      action={editChargeAction}
      hidden={{ chargeId }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`amount-${chargeId}`} label={t("amount")} name="amount" defaultValue={amount} inputMode="decimal" required />
        <Field id={`due-${chargeId}`} label={t("dueDate")} name="dueDate" type="date" defaultValue={dueDate} required />
      </div>
    </ReasonForm>
  );
}

/** Admin only (V7): a monthly fee (optionally for a cycle) or a one-off item. */
export function AddChargeButton({ enrollmentId, today }: { enrollmentId: string; today: string }) {
  const t = useTranslations("billing.teacher");
  const tKind = useTranslations("billing.kind");
  const id = `add-${enrollmentId}`;
  return (
    <ReasonForm id={id} label={t("addCharge")} confirmLabel={t("addCharge")} action={addChargeAction} hidden={{ enrollmentId }}>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`kind-${id}`}>{t("kind")}</Label>
        <select id={`kind-${id}`} name="kind" className="h-11 rounded-lg border border-input bg-card px-3 text-base">
          <option value="monthly">{tKind("monthly")}</option>
          <option value="extra_lesson">{t("oneOff")}</option>
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id={`amount-${id}`} label={t("amount")} name="amount" inputMode="decimal" required />
        <Field id={`due-${id}`} label={t("dueDate")} name="dueDate" type="date" defaultValue={today} required />
        <Field id={`start-${id}`} label={t("periodStart")} name="periodStart" type="date" />
        <Field id={`end-${id}`} label={t("periodEnd")} name="periodEnd" type="date" />
      </div>
      <p className="text-xs text-muted-foreground">{t("periodHint")}</p>
    </ReasonForm>
  );
}
