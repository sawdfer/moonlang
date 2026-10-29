import { useTranslations } from "next-intl";
import type { ActionResult } from "../actions";

export function ActionError({ state }: { state: ActionResult }) {
  const t = useTranslations("billing.errors");
  if (!state || state.ok) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {t(state.error)}
    </p>
  );
}
