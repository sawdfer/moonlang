"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { ActionForm } from "@/components/forms/action-form";
import { FormError } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL } from "@/lib/money";
import { registerStudentAction, type RegisterStudentState } from "./actions";

const initialState: RegisterStudentState = { errors: {} };
const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];
const selectClass = "h-11 rounded-lg border border-input bg-card px-3 text-base";

type Options = {
  groups: { id: string; name: string; durationMinutes: number }[];
  plans: { id: string; name: string; durationMinutes: number; priceCents: number }[];
  dueDayOptions: number[];
};

export function RegisterStudentForm({ options }: { options: Options }) {
  const t = useTranslations("people.register");
  const [state, action, pending] = useActionState(registerStudentAction, initialState);
  const [kind, setKind] = useState<"trial" | "student" | "existing">("student");
  const [groupId, setGroupId] = useState(options.groups[0]?.id ?? "");
  const e = state.errors;
  const duration = options.groups.find((g) => g.id === groupId)?.durationMinutes;
  const plans = options.plans.filter((p) => p.durationMinutes === duration);

  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("kindLabel")}</legend>
        {(["student", "trial", "existing"] as const).map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="kind"
              value={k}
              checked={kind === k}
              onChange={() => setKind(k)}
              className="mt-1 accent-primary"
            />
            <span>
              <span className="font-medium">{t(`kind.${k}`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`kindHint.${k}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <Field name="name" label={t("name")} error={e.name} autoComplete="off" />
      <Field name="email" label={t("email")} error={e.email} type="email" />
      <Field name="phoneNumber" label={t("phone")} error={e.phoneNumber} type="tel" />
      <Field name="birthDate" label={t("birthDate")} error={e.birthDate} type="date" />
      <div className="flex flex-col gap-2">
        <Label htmlFor="cefrLevel">{t("cefrLevel")}</Label>
        <select id="cefrLevel" name="cefrLevel" defaultValue="" className={selectClass}>
          <option value="">{t("noLevel")}</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="goal">{t("goal")}</Label>
        <Input id="goal" name="goal" maxLength={500} />
        <FormError code={e.goal} />
      </div>

      {kind === "existing" && (
        <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">{t("placementTitle")}</legend>
          {options.groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noGroups")}</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="classGroupId">{t("group")}</Label>
                <select
                  id="classGroupId"
                  name="classGroupId"
                  value={groupId}
                  onChange={(event) => setGroupId(event.target.value)}
                  className={selectClass}
                >
                  {options.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <FormError code={e.classGroupId} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="planId">{t("plan")}</Label>
                <select key={groupId} id="planId" name="planId" className={selectClass}>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {formatBRL(p.priceCents)}
                    </option>
                  ))}
                </select>
                <FormError code={e.planId} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="dueDay">{t("dueDay")}</Label>
                <select id="dueDay" name="dueDay" className={selectClass}>
                  {options.dueDayOptions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">{t("dueDayHint")}</p>
                <FormError code={e.dueDay} />
              </div>
            </>
          )}
        </fieldset>
      )}
      {kind !== "existing" && (
        <>
          <input type="hidden" name="classGroupId" value="" />
          <input type="hidden" name="planId" value="" />
          <input type="hidden" name="dueDay" value="" />
        </>
      )}

      <p className="text-xs text-muted-foreground">{t("emailHint")}</p>
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
  error,
  ...props
}: { name: string; label: string; error?: string } & React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required aria-invalid={Boolean(error)} {...props} />
      <FormError code={error} />
    </div>
  );
}
