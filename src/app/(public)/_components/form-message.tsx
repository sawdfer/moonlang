"use client";

import { useTranslations } from "next-intl";

/** Shows a translated error from `auth.errors` under a field, or for the whole form. */
export function FormError({ code, id }: { code?: string; id?: string }) {
  const t = useTranslations("auth.errors");
  if (!code) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {t.has(code) ? t(code) : t("generic")}
    </p>
  );
}
