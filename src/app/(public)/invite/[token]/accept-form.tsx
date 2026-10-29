"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/forms/action-form";
import { FormError } from "@/components/forms/form-message";
import { acceptInviteAction, type AcceptInviteState } from "./actions";

const initialState: AcceptInviteState = { errors: {} };

export function AcceptInviteForm({
  token,
  defaults,
}: {
  token: string;
  defaults: { name: string; email: string; phoneNumber: string };
}) {
  const t = useTranslations("auth.invite");
  const [state, action, pending] = useActionState(
    acceptInviteAction.bind(null, token),
    initialState,
  );
  const e = state.errors;

  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <Field name="name" label={t("name")} error={e.name} defaultValue={defaults.name} autoComplete="name" />
      <Field name="email" label={t("email")} error={e.email} defaultValue={defaults.email} type="email" autoComplete="email" />
      <Field
        name="phoneNumber"
        label={t("phone")}
        hint={t("phoneHint")}
        error={e.phoneNumber}
        defaultValue={defaults.phoneNumber}
        type="tel"
        autoComplete="tel"
      />
      <Field name="birthDate" label={t("birthDate")} error={e.birthDate} type="date" autoComplete="bday" />
      <Field
        name="password"
        label={t("password")}
        hint={t("passwordHint")}
        error={e.password}
        type="password"
        autoComplete="new-password"
      />
      <Field
        name="passwordConfirmation"
        label={t("passwordConfirmation")}
        error={e.passwordConfirmation}
        type="password"
        autoComplete="new-password"
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="goal">{t("goal")}</Label>
        <textarea
          id="goal"
          name="goal"
          maxLength={500}
          rows={3}
          placeholder={t("goalPlaceholder")}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-base placeholder:text-muted-foreground"
        />
        <FormError code={e.goal} />
      </div>
      {/* RN-023: accepting the recording term and privacy policy is mandatory. */}
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="acceptTerms" required className="mt-1 size-4 accent-primary" />
          <span>
            {t.rich("acceptTerms", {
              link: (chunks) => (
                <Link href="/terms" target="_blank" className="font-semibold underline underline-offset-4">
                  {chunks}
                </Link>
              ),
            })}
          </span>
        </label>
        <FormError code={e.acceptTerms} />
      </div>
      <FormError code={e.form} />
      <Button type="submit" disabled={pending}>
        {t("submit")}
      </Button>
    </ActionForm>
  );
}

function Field({
  name,
  label,
  hint,
  error,
  ...props
}: {
  name: string;
  label: string;
  hint?: string;
  error?: string;
} & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required aria-invalid={Boolean(error)} {...props} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FormError code={error} />
    </div>
  );
}
