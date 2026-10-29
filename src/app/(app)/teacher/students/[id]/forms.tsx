"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { FormError } from "@/components/forms/form-message";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  contactAttemptAction,
  overrideDueDayAction,
  type ProfileFormState,
  removeAccountAction,
  updateStudentAction,
} from "./actions";

const initialState: ProfileFormState = { errors: {} };
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const selectClass = "h-11 rounded-lg border border-input bg-card px-3 text-base";
const textareaClass = "w-full rounded-lg border border-input bg-card px-3 py-2 text-base";

function Saved({ show }: { show?: boolean }) {
  const t = useTranslations("people.profile");
  return show ? (
    <p role="status" className="text-sm text-primary">
      {t("saved")}
    </p>
  ) : null;
}

export function StudentEditForm({
  studentId,
  values,
}: {
  studentId: string;
  values: {
    name: string;
    email: string;
    phoneNumber: string;
    birthDate: string;
    goal: string;
    cefrLevel: string;
    privateNotes: string;
  };
}) {
  const t = useTranslations("people.profile");
  const [state, action, pending] = useActionState(updateStudentAction.bind(null, studentId), initialState);
  const e = state.errors;
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="name" label={t("name")} defaultValue={values.name} error={e.name} />
        <Field name="email" label={t("email")} type="email" defaultValue={values.email} error={e.email} />
        <Field name="phoneNumber" label={t("phone")} type="tel" defaultValue={values.phoneNumber} error={e.phoneNumber} />
        <Field name="birthDate" label={t("birthDate")} type="date" defaultValue={values.birthDate} error={e.birthDate} />
        <div className="flex flex-col gap-2">
          <Label htmlFor="cefrLevel">{t("cefrLevel")}</Label>
          <select id="cefrLevel" name="cefrLevel" defaultValue={values.cefrLevel} className={selectClass}>
            <option value="">{t("noLevel")}</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <Field name="goal" label={t("goal")} defaultValue={values.goal} error={e.goal} required={false} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="privateNotes">{t("privateNotes")}</Label>
        <textarea
          id="privateNotes"
          name="privateNotes"
          rows={4}
          maxLength={5000}
          defaultValue={values.privateNotes}
          className={textareaClass}
        />
        <p className="text-xs text-muted-foreground">{t("privateNotesHint")}</p>
      </div>
      <FormError code={e.form} />
      <Saved show={state.saved} />
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
    </ActionForm>
  );
}

export function ContactAttemptForm({ studentId }: { studentId: string }) {
  const t = useTranslations("people.profile");
  const [state, action, pending] = useActionState(contactAttemptAction.bind(null, studentId), initialState);
  return (
    <div className="flex flex-col gap-3">
      <ActionForm key={state.saved ? "saved" : "form"} action={action} className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="channel">{t("channel")}</Label>
            <select id="channel" name="channel" defaultValue="whatsapp" className={selectClass}>
              {(["whatsapp", "email", "phone_call"] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`channels.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <Field name="outcome" label={t("outcome")} error={state.errors.outcome} required={false} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="note">{t("note")}</Label>
          <textarea id="note" name="note" rows={2} maxLength={1000} className={textareaClass} />
        </div>
        <FormError code={state.errors.form} />
        <Button type="submit" variant="outline" disabled={pending}>
          {t("recordAttempt")}
        </Button>
      </ActionForm>
      {state.whatsappUrl && (
        <a
          href={state.whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: "accent" })}
        >
          {t("openWhatsApp")}
        </a>
      )}
      <Saved show={state.saved} />
    </div>
  );
}

export function DueDayOverrideForm({
  studentId,
  current,
  options,
}: {
  studentId: string;
  current: number | null;
  options: number[];
}) {
  const t = useTranslations("people.profile");
  const [state, action, pending] = useActionState(overrideDueDayAction.bind(null, studentId), initialState);
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="dueDay">{t("dueDayOverride")}</Label>
        <select id="dueDay" name="dueDay" defaultValue={current ?? options[0]} className={selectClass}>
          {options.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {t("save")}
      </Button>
      <FormError code={state.errors.form} />
      <Saved show={state.saved} />
    </ActionForm>
  );
}

export function RemoveAccountForm({ studentId }: { studentId: string }) {
  const t = useTranslations("people.profile");
  const [state, action, pending] = useActionState(removeAccountAction.bind(null, studentId), initialState);
  return (
    <ActionForm action={action} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">{t("removeReason")}</Label>
        <Input id="reason" name="reason" required maxLength={500} />
        <FormError code={state.errors.reason} />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm" className="mt-1 accent-primary" />
        <span>{t("removeConfirm")}</span>
      </label>
      <FormError code={state.errors.confirm ?? state.errors.form} />
      <Button type="submit" variant="destructive" disabled={pending}>
        {t("remove")}
      </Button>
    </ActionForm>
  );
}

function Field({
  name,
  label,
  error,
  required = true,
  ...props
}: { name: string; label: string; error?: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required={required} aria-invalid={Boolean(error)} {...props} />
      <FormError code={error} />
    </div>
  );
}
