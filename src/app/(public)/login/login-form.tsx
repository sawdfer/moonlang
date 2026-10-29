"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { normalizePhone } from "@/server/auth/phone";
import { homePathAction } from "./actions";

/** Accepts e-mail or phone number plus password, then the two-factor code when enabled (F-001). */
export function LoginForm() {
  const t = useTranslations("login");
  const tf = useTranslations("auth.login");
  const router = useRouter();
  const [step, setStep] = useState<"password" | "totp" | "backup">("password");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function goHome() {
    router.replace(await homePathAction());
    router.refresh();
  }

  async function onSubmitPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const result = identifier.includes("@")
      ? await authClient.signIn.email({ email: identifier, password })
      : await authClient.signIn.phoneNumber({
          // Phones are stored in E.164; people type them in many formats.
          phoneNumber: normalizePhone(identifier) ?? identifier,
          password,
        });

    setPending(false);
    if (result.error) {
      setError(result.error.status === 429 ? tf("tooManyAttempts") : t("error"));
      return;
    }
    if (result.data && "twoFactorRedirect" in result.data && result.data.twoFactorRedirect) {
      setStep("totp");
      return;
    }
    await goHome();
  }

  async function onSubmitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    const result =
      step === "totp"
        ? await authClient.twoFactor.verifyTotp({ code })
        : await authClient.twoFactor.verifyBackupCode({ code });
    setPending(false);
    if (result.error) {
      setError(result.error.status === 429 ? tf("tooManyAttempts") : tf("invalidCode"));
      return;
    }
    await goHome();
  }

  if (step !== "password") {
    return (
      <form key={step} onSubmit={onSubmitCode} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {tf(step === "totp" ? "totpHelp" : "backupHelp")}
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">{tf(step === "totp" ? "totpLabel" : "backupLabel")}</Label>
          <Input
            id="code"
            name="code"
            autoComplete="one-time-code"
            inputMode={step === "totp" ? "numeric" : "text"}
            autoFocus
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {tf("verify")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setError(null);
            setStep(step === "totp" ? "backup" : "totp");
          }}
        >
          {tf(step === "totp" ? "useBackup" : "useTotp")}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitPassword} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="identifier">{t("identifier")}</Label>
        <Input id="identifier" name="identifier" autoComplete="username" required />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">{t("password")}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
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
      <Link
        href="/forgot-password"
        className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        {tf("forgotPassword")}
      </Link>
    </form>
  );
}
