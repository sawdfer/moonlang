import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { homePathFor } from "@/server/auth/roles";
import { hasPendingConsent, requireSignedIn } from "@/server/auth/session";
import { SignOutButton } from "../_components/sign-out-button";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Termos atualizados" };

/** Shown when the terms changed since the user last accepted them (RN-023). */
export default async function ConsentPage() {
  const user = await requireSignedIn();
  if (!(await hasPendingConsent(user.id, user.role))) redirect(homePathFor(user.role));
  const t = await getTranslations("auth.consent");

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("body")}</p>
      </div>
      <Card>
        <ConsentForm />
      </Card>
      <div className="flex justify-center">
        <SignOutButton variant="ghost" />
      </div>
    </main>
  );
}
