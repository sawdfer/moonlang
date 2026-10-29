"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "../../_components/action-form";
import { FormError } from "../../_components/form-message";
import { createStaffAction, type CreateStaffState } from "./actions";

const initialState: CreateStaffState = { errors: {} };

export function StaffForm({ roles }: { roles: ("admin" | "teacher")[] }) {
  const t = useTranslations("auth.team");
  const [state, action, pending] = useActionState(createStaffAction, initialState);
  const e = state.errors;

  return (
    <ActionForm key={state.created} action={action} className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold">{t("newStaff")}</h2>
      {state.created && (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm">
          {t("staffCreated", { email: state.created })}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="role">{t("roleLabel")}</Label>
        <select
          id="role"
          name="role"
          defaultValue="teacher"
          className="h-11 rounded-lg border border-input bg-card px-3 text-base"
        >
          {roles.map((role) => (
            <option key={role} value={role}>
              {t(`role.${role}`)}
            </option>
          ))}
        </select>
        <FormError code={e.role} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" required />
        <FormError code={e.name} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" required />
        <FormError code={e.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phoneNumber">{t("phoneOptional")}</Label>
        <Input id="phoneNumber" name="phoneNumber" type="tel" />
        <FormError code={e.phoneNumber} />
      </div>
      <p className="text-xs text-muted-foreground">{t("staffHint")}</p>
      <FormError code={e.form} />
      <Button type="submit" disabled={pending}>
        {t("createStaff")}
      </Button>
    </ActionForm>
  );
}
