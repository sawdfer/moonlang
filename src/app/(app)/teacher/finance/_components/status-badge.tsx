import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { ChargeStatus } from "@/server/billing/rules";

const styles: Record<ChargeStatus, string> = {
  pending: "border-primary/40 text-primary",
  paid: "border-success/40 text-success",
  overdue: "border-destructive/50 bg-destructive/10 text-destructive",
  cancelled: "text-muted-foreground line-through",
};

/** Charge status pill, shared by the teacher and student finance pages (RN-014). */
export function StatusBadge({ status }: { status: ChargeStatus }) {
  const t = useTranslations("billing.status");
  return (
    <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", styles[status])}>
      {t(status)}
    </span>
  );
}
