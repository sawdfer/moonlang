"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/server/people/schemas";

export function ResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("auth.resetPassword");
  const te = useTranslations("auth.errors");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("password") ?? "");
    if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
      setError(te("passwordLength"));
      return;
    }
    if (newPassword !== form.get("passwordConfirmation")) {
      setError(te("passwordMismatch"));
      return;
    }
    setPending(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (result.error) {
      setError(
        result.error.code === "PASSWORD_COMPROMISED"
          ? te("password_compromised")
          : result.error.code === "INVALID_TOKEN"
            ? t("invalidLink")
            : te("generic"),
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p>{t("done")}</p>
        <Link href="/login" className="text-sm font-semibold underline underline-offset-4">
          {t("goToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
        <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="passwordConfirmation">{t("passwordConfirmation")}</Label>
        <Input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {t("submit")}
      </Button>
    </form>
  );
}
