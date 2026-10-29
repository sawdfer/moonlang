import { MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { NotificationBell } from "@/components/notifications";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { requireStaff } from "@/server/auth/session";
import { listWhatsAppQueue } from "@/server/notifications/queries";
import { waMeUrl } from "@/server/notifications/whatsapp";
import { discardWhatsApp, markWhatsAppSent } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notifications.whatsapp");
  return { title: t("title") };
}

const KNOWN_SOURCES = new Set(["announcement", "lesson_tomorrow"]);

// Teacher's WhatsApp queue (F-008): ready-made texts sent from her own phone via wa.me.
export default async function WhatsAppQueuePage() {
  await requireStaff();
  const [t, format, messages] = await Promise.all([
    getTranslations("notifications.whatsapp"),
    getFormatter(),
    listWhatsAppQueue(db, new Date()),
  ]);
  const when = (date: Date) =>
    format.dateTime(date, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <NotificationBell />
      </header>

      {messages.length === 0 ? (
        <Card className="text-center text-muted-foreground">{t("empty")}</Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {messages.map((m) => (
            <li key={m.id}>
              <Card className="flex flex-col gap-3 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    <span className="sr-only">{t("to")}: </span>
                    {m.recipientName ?? `+${m.phoneNumber}`}
                  </p>
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                    {t(`source.${KNOWN_SOURCES.has(m.sourceType) ? m.sourceType : "other"}` as "source.other")}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-line">{m.body}</p>
                <p className="text-xs text-muted-foreground">
                  {t("createdAt", { date: when(m.createdAt) })}
                  {m.expiresAt && <> · {t("expiresAt", { date: when(m.expiresAt) })}</>}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={waMeUrl(m.phoneNumber, m.body)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: "primary" })}
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    {t("send")}
                  </a>
                  <form action={markWhatsAppSent.bind(null, m.id)}>
                    <Button type="submit" variant="outline">
                      {t("markSent")}
                    </Button>
                  </form>
                  <form action={discardWhatsApp.bind(null, m.id)}>
                    <Button type="submit" variant="ghost">
                      {t("discard")}
                    </Button>
                  </form>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
