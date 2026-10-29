import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StudentLesson } from "@/server/classes/student";

/**
 * The meeting link is only rendered here, when the server allowed it for this
 * student (RN-015, RN-024). It never goes to notifications or e-mails.
 */
export async function JoinArea({ lesson, compact = false }: { lesson: StudentLesson; compact?: boolean }) {
  const t = await getTranslations("studentLessons");
  if (lesson.blocked) {
    return <p className="mt-3 text-sm text-destructive">{t("blocked")}</p>;
  }
  if (!lesson.meetingUrl) {
    if (lesson.status === "confirmed" && !compact) {
      return <p className="mt-3 text-sm text-muted-foreground">{t("linkSoon")}</p>;
    }
    return null;
  }
  return (
    <a
      href={lesson.meetingUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(buttonVariants({ size: compact ? "sm" : "lg", variant: compact ? "outline" : "primary" }), "mt-3")}
    >
      {t("join")} 🌙
    </a>
  );
}
