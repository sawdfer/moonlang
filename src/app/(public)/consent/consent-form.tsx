"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { ActionForm } from "@/components/forms/action-form";
import { FormError } from "@/components/forms/form-message";
import { acceptTermsAction, type ConsentState } from "./actions";

const initialState: ConsentState = {};

export function ConsentForm() {
  const t = useTranslations("auth.invite");
  const tc = useTranslations("auth.consent");
  const [state, action, pending] = useActionState(acceptTermsAction, initialState);
  return (
    <ActionForm action={action} className="flex flex-col gap-4">
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
      <FormError code={state.error} />
      <Button type="submit" disabled={pending}>
        {tc("submit")}
      </Button>
    </ActionForm>
  );
}
