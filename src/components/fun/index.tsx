import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { cefrBand, type FunBand, type FunKey, funMessageId } from "@/i18n/fun";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/session";
import { isStaff } from "@/server/auth/roles";
import { cefrLevelOf } from "@/server/dashboard/queries";

/**
 * A fun empty-state or celebration line whose tone follows the CEFR level
 * (F-010). Pass `level` for a student, or `band` directly (staff use "intermediate").
 */
export async function FunMessage({
  messageKey,
  level,
  band,
  className,
}: {
  messageKey: FunKey;
  level?: string | null;
  band?: FunBand;
  className?: string;
}) {
  const t = await getTranslations("fun");
  return <p className={cn("text-muted-foreground", className)}>{t(funMessageId(messageKey, band ?? cefrBand(level)))}</p>;
}

/**
 * Empty state for the student lessons page (F-004 + F-010): place it where the
 * page shows "no lessons", e.g. `{!next ? <StudentLessonsEmptyState /> : …}`.
 */
export async function StudentLessonsEmptyState({ className }: { className?: string }) {
  const user = await getCurrentUser();
  const level = user && !isStaff(user.role) ? await cefrLevelOf(db, user.id) : null;
  return (
    <Card className={cn("flex items-center gap-4", className)}>
      <span className="text-4xl" aria-hidden>
        🌙
      </span>
      <FunMessage messageKey="noUpcomingLessons" level={level} />
    </Card>
  );
}
