"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordForm() {
  const t = useTranslations("auth.forgotPassword");
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("pending");
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    // Same answer whether or not the e-mail has an account.
    setState(result.error && result.error.status === 429 ? "error" : "sent");
  }

  if (state === "sent") {
    return (
      <div className="flex flex-col gap-4 text-center">
        <p>{t("sent")}</p>
        <Link href="/login" className="text-sm underline underline-offset-4">
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t("tooManyAttempts")}
        </p>
      )}
      <Button type="submit" disabled={state === "pending"}>
        {t("submit")}
      </Button>
    </form>
  );
}
