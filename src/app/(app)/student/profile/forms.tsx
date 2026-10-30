"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { FormError } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeDueDayAction, type OwnProfileState, updateOwnProfileAction } from "./actions";

const initialState: OwnProfileState = { errors: {} };

export function OwnProfileForm({
  values,
}: {
  values: { name: string; email: string; phoneNumber: string; goal: string };
}) {
  const t = useTranslations("people.self");
  const [state, action, pending] = useActionState(updateOwnProfileAction, initialState);
  const [email, setEmail] = useState(values.email);
  const e = state.errors;
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <Field name="name" label={t("name")} defaultValue={values.name} error={e.name} autoComplete="name" />
      <Field
        name="email"
        label={t("email")}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={e.email}
        autoComplete="email"
      />
      {email.trim().toLowerCase() !== values.email && (
        <Field
          name="currentPassword"
          label={t("currentPassword")}
          type="password"
          error={e.currentPassword}
          autoComplete="current-password"
        />
      )}
      <Field
        name="phoneNumber"
        label={t("phone")}
        type="tel"
        defaultValue={values.phoneNumber}
        error={e.phoneNumber}
        autoComplete="tel"
      />
      <Field name="goal" label={t("goal")} defaultValue={values.goal} error={e.goal} required={false} />
      <FormError code={e.form} />
      {state.saved && (
        <p role="status" className="text-sm text-primary">
          {t("saved")}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
    </ActionForm>
  );
}

export function DueDayForm({ current, options }: { current: number; options: number[] }) {
  const t = useTranslations("people.self");
  const format = useFormatter();
  const [state, action, pending] = useActionState(changeDueDayAction, initialState);
  return (
    <ActionForm action={action} className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="dueDay">{t("dueDayLabel")}</Label>
        <select
          id="dueDay"
          name="dueDay"
          defaultValue={current}
          className="h-11 rounded-lg border border-input bg-card px-3 text-base"
        >
          {options.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        {t("changeDueDay")}
      </Button>
      {state.allowedFrom ? (
        <p role="alert" className="w-full text-sm text-destructive">
          {t("dueDayFrom", { date: format.dateTime(new Date(state.allowedFrom), { dateStyle: "long" }) })}
        </p>
      ) : (
        <FormError code={state.errors.form} />
      )}
      {state.saved && (
        <p role="status" className="w-full text-sm text-primary">
          {t("saved")}
        </p>
      )}
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
