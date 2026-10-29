import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { StudentLesson } from "@/server/classes/student";

/**
 * "Entrar na aula" points to the join endpoint, which records attendance and
 * only then reveals the meeting link (RN-024, V1). The link itself is never
 * rendered in the page, notifications or e-mails.
 */
export async function JoinArea({ lesson, compact = false }: { lesson: StudentLesson; compact?: boolean }) {
  const t = await getTranslations("studentLessons");
  if (lesson.blocked) {
    return <p className="mt-3 text-sm text-destructive">{t("blocked")}</p>;
  }
  if (!lesson.canJoin) return null;
  if (!lesson.hasMeetingLink) {
    return compact ? null : <p className="mt-3 text-sm text-muted-foreground">{t("linkSoon")}</p>;
  }
  if (!lesson.joinOpen) {
    return compact ? null : <p className="mt-3 text-sm text-muted-foreground">{t("joinOpensSoon")}</p>;
  }
  return (
    // A plain <a>, not <Link>: prefetching must never record attendance.
    <a
      href={`/student/lessons/${lesson.id}/join`}
      target="_blank"
      rel="noopener"
      className={cn(buttonVariants({ size: compact ? "sm" : "lg", variant: compact ? "outline" : "primary" }), "mt-3")}
    >
      {t("join")} 🌙
    </a>
  );
}
