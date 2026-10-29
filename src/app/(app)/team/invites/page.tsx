import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { db } from "@/db";
import { requireStaff } from "@/server/auth/session";
import { inviteStatus } from "@/server/people/rules";
import { listRecentInvites } from "@/server/people/store";
import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Convites" };

/** Staff invite students and trial students (F-001). */
export default async function InvitesPage() {
  await requireStaff();
  const [t, format, invites] = await Promise.all([
    getTranslations("auth.team"),
    getFormatter(),
    listRecentInvites(db),
  ]);
  const now = new Date();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{t("invitesTitle")}</h1>
      <Card>
        <InviteForm />
      </Card>
      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl font-semibold">{t("recentInvites")}</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noInvites")}</p>
        ) : (
          <ul className="divide-y rounded-xl border bg-card">
            {invites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{invite.name}</span>
                <span className="text-muted-foreground">
                  {t(`kind.${invite.kind}`)} · {t(`status.${inviteStatus(invite, now)}`)} ·{" "}
                  {format.dateTime(invite.expiresAt, { dateStyle: "short", timeStyle: "short" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
