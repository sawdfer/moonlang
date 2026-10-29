import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { findInvite } from "@/server/people/invites";
import { AcceptInviteForm } from "./accept-form";

export const metadata: Metadata = { title: "Convite", robots: { index: false } };

/** Invite acceptance (F-001, RN-020). The token itself is the only credential here. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTranslations("auth.invite");
  const found = await findInvite(token);

  if (found.status !== "valid") {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-16 text-center">
        <h1 className="font-display text-3xl font-semibold">{t("unavailableTitle")}</h1>
        <p className="text-muted-foreground">{t("unavailableBody")}</p>
      </main>
    );
  }

  const { invite } = found;
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-3xl font-semibold">
          {t("title", { name: invite.name.split(" ")[0] })}
        </h1>
        <p className="text-muted-foreground">{t(invite.kind === "trial" ? "subtitleTrial" : "subtitle")}</p>
      </div>
      <Card>
        <AcceptInviteForm
          token={token}
          defaults={{
            name: invite.name,
            email: invite.email ?? "",
            phoneNumber: invite.phoneNumber ?? "",
          }}
        />
      </Card>
    </main>
  );
}
