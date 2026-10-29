import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Nova senha", robots: { index: false } };

/** Target of the e-mail link; Better Auth adds `?token=` or `?error=INVALID_TOKEN`. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const welcome = params.welcome === "1";
  const t = await getTranslations("auth.resetPassword");

  return (
    <main className="mx-auto flex w-full max-w-sm flex-col gap-6 px-4 py-16">
      <h1 className="text-center font-display text-3xl font-semibold">
        {t(welcome ? "welcomeTitle" : "title")}
      </h1>
      <Card>
        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div className="flex flex-col gap-4 text-center">
            <p>{t("invalidLink")}</p>
            <Link href="/forgot-password" className="text-sm underline underline-offset-4">
              {t("requestNew")}
            </Link>
          </div>
        )}
      </Card>
    </main>
  );
}
