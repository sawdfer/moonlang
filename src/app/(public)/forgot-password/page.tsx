import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Recuperar senha" };

/** Password recovery is by e-mail (F-001). */
export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth.forgotPassword");
  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2 text-center">
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>
      <Card>
        <ForgotPasswordForm />
      </Card>
    </main>
  );
}
