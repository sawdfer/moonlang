import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import type { StudentStatus } from "@/server/people/situation";

const TONES: Record<StudentStatus, string> = {
  trial: "bg-accent/30",
  active: "bg-primary/15",
  blocked: "bg-destructive/15 text-destructive",
  dropped: "bg-muted text-muted-foreground",
};

/** Situation of a student (F-002): status plus the inactivity flag (RN-021). */
export async function SituationBadges({ status, inactive }: { status: StudentStatus; inactive: boolean }) {
  const t = await getTranslations("people.status");
  return (
    <span className="flex flex-wrap gap-1">
      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TONES[status])}>{t(status)}</span>
      {inactive && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
          {t("inactive")}
        </span>
      )}
    </span>
  );
}
