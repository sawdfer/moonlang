import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { canDisableTwoFactor } from "@/server/auth/access";
import { homePathFor, isStaff } from "@/server/auth/roles";
import { requireSignedIn } from "@/server/auth/session";
import { SessionsPanel } from "./sessions-panel";
import { TwoFactorPanel } from "./two-factor-panel";

export const metadata: Metadata = { title: "Segurança" };

/**
 * Two-factor and sessions (F-001). Staff without two-factor are sent here by
 * `requireUser` and cannot leave until they enroll, so this page only checks
 * that someone is signed in.
 */
export default async function SecurityPage() {
  const user = await requireSignedIn();
  const t = await getTranslations("auth.security");
  const mustEnroll = isStaff(user.role) && !user.twoFactorEnabled;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        {mustEnroll && (
          <p role="status" className="rounded-lg bg-muted p-3 text-sm">
            {t("staffRequired")}
          </p>
        )}
      </div>
      <Card>
        <TwoFactorPanel
          enabled={user.twoFactorEnabled}
          canDisable={canDisableTwoFactor(user.role)}
          homePath={homePathFor(user.role)}
        />
      </Card>
      <Card>
        <SessionsPanel />
      </Card>
      <div className="flex items-center justify-between">
        {mustEnroll ? (
          <span />
        ) : (
          <Link href={homePathFor(user.role)} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            {t("back")}
          </Link>
        )}
      </div>
    </main>
  );
}
