"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, startTransition, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { FormState } from "@/server/classes/form-state";

/**
 * A form bound to a Server Action that shows its errors, its schedule warnings
 * and, when there are warnings, a checkbox to confirm anyway (RN-003).
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  variant,
  className,
  confirmText,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  children?: ReactNode;
  submitLabel: string;
  variant?: "primary" | "outline" | "destructive" | "ghost";
  className?: string;
  /** Shown in a native confirmation dialog before submitting. */
  confirmText?: string;
}) {
  const t = useTranslations("classes");
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form
      className={cn("flex flex-col gap-4", className)}
      onSubmit={(event) => {
        // Submitting by hand (not via `action`) keeps the typed values when the
        // server answers with an error or a warning to confirm.
        event.preventDefault();
        if (confirmText && !window.confirm(confirmText)) return;
        const formData = new FormData(event.currentTarget);
        startTransition(() => formAction(formData));
      }}
    >
      {children}
      {state?.issues && state.issues.length > 0 && (
        <div role="alert" className="rounded-lg border border-accent bg-accent/15 p-3 text-sm">
          <p className="font-semibold">{t("issues.title")}</p>
          <ul className="mt-1 list-disc pl-5">
            {state.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="force" value="1" />
            {t("issues.confirm")}
          </label>
        </div>
      )}
      {state?.error && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.error}`)}
        </p>
      )}
      {state?.success && (
        <p role="status" className="text-sm text-success">
          {t(`success.${state.success}`)}
        </p>
      )}
      <div>
        <Button type="submit" variant={variant} size="sm" disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
