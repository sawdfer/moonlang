import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { NotificationBell } from "@/components/notifications";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { requireStaff } from "@/server/auth/session";
import { announcementOptions, recentAnnouncements } from "@/server/notifications/queries";
import { AnnouncementForm } from "./announcement-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications.announcements");
  return { title: t("title") };
}

// Announcements to everyone, class groups or specific students (F-008).
export default async function AnnouncementsPage() {
  await requireStaff();
  const now = new Date();
  const [t, format, options, recent] = await Promise.all([
    getTranslations("notifications.announcements"),
    getFormatter(),
    announcementOptions(db, now),
    recentAnnouncements(db),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <NotificationBell />
      </header>

      <Card>
        <AnnouncementForm classGroups={options.classGroups} students={options.students} />
      </Card>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold">{t("recent")}</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("recentEmpty")}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {recent.map((a) => (
              <li key={a.id}>
                <Card className="p-4">
                  <p className="text-sm whitespace-pre-line">{a.body}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {format.dateTime(a.createdAt, {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {a.authorName && <> · {a.authorName}</>} · {t("recipients", { count: a.recipients })}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
