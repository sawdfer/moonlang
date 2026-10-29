"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Setup = { totpURI: string; secret: string; backupCodes: string[] };

/**
 * Two-factor with an authenticator app (F-001): mandatory for staff, optional
 * for students. Enrollment: confirm the password, add the key to the app,
 * confirm a code. Backup codes are shown once.
 */
export function TwoFactorPanel({
  enabled,
  canDisable,
  homePath,
}: {
  enabled: boolean;
  canDisable: boolean;
  homePath: string;
}) {
  const t = useTranslations("auth.security");
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [justEnabled, setJustEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run<T>(fn: () => Promise<{ data: T | null; error: { status: number } | null }>) {
    setPending(true);
    setError(null);
    const result = await fn();
    setPending(false);
    if (result.error) {
      setError(t(result.error.status === 429 ? "tooManyAttempts" : "error"));
      return null;
    }
    return result.data;
  }

  async function startEnroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const data = await run(() => authClient.twoFactor.enable({ password, method: "totp" }));
    if (!data || data.method !== "totp") return;
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setSetup({ totpURI: data.totpURI, secret, backupCodes: data.backupCodes });
  }

  async function confirmEnroll(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").replace(/\s/g, "");
    const data = await run(() => authClient.twoFactor.verifyTotp({ code }));
    if (!data || !setup) return;
    setBackupCodes(setup.backupCodes);
    setSetup(null);
    setJustEnabled(true);
  }

  async function regenerateCodes(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const data = await run(() => authClient.twoFactor.generateBackupCodes({ password }));
    if (data) setBackupCodes(data.backupCodes);
  }

  async function disable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    const data = await run(() => authClient.twoFactor.disable({ password }));
    if (data) router.refresh();
  }

  const errorMessage = error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );

  if (backupCodes) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">
          {justEnabled ? t("enabledTitle") : t("backupTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("backupBody")}</p>
        <ul className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-4 font-mono text-sm">
          {backupCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Button
          type="button"
          onClick={() => {
            setBackupCodes(null);
            if (justEnabled) {
              router.replace(homePath);
            }
            router.refresh();
          }}
        >
          {t("backupSaved")}
        </Button>
      </div>
    );
  }

  if (setup) {
    return (
      <form method="post" onSubmit={confirmEnroll} className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">{t("setupTitle")}</h2>
        <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm">
          <li>{t("setupStep1")}</li>
          <li>
            {t("setupStep2")}{" "}
            <a href={setup.totpURI} className="font-semibold underline underline-offset-4">
              {t("setupOpenApp")}
            </a>
          </li>
          <li>{t("setupStep3")}</li>
        </ol>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("setupKey")}</span>
          <code className="break-all rounded-lg bg-muted p-3 font-mono text-sm select-all">
            {setup.secret.match(/.{1,4}/g)?.join(" ")}
          </code>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="code">{t("codeLabel")}</Label>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
        </div>
        {errorMessage}
        <Button type="submit" disabled={pending}>
          {t("confirm")}
        </Button>
      </form>
    );
  }

  if (!enabled) {
    return (
      <form method="post" onSubmit={startEnroll} className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">{t("twoFactorTitle")}</h2>
        <p className="text-sm text-muted-foreground">{t("twoFactorOff")}</p>
        <PasswordField label={t("passwordLabel")} />
        {errorMessage}
        <Button type="submit" disabled={pending}>
          {t("enable")}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold">{t("twoFactorTitle")}</h2>
      <p className="text-sm">{t("twoFactorOn")}</p>
      <details className="flex flex-col gap-3">
        <summary className="cursor-pointer text-sm font-semibold">{t("regenerate")}</summary>
        <form method="post" onSubmit={regenerateCodes} className="mt-3 flex flex-col gap-3">
          <PasswordField id="regenerate-password" label={t("passwordLabel")} />
          <Button type="submit" variant="outline" disabled={pending}>
            {t("regenerate")}
          </Button>
        </form>
      </details>
      {canDisable && (
        <details className="flex flex-col gap-3">
          <summary className="cursor-pointer text-sm font-semibold">{t("disable")}</summary>
          <form method="post" onSubmit={disable} className="mt-3 flex flex-col gap-3">
            <PasswordField id="disable-password" label={t("passwordLabel")} />
            <Button type="submit" variant="destructive" disabled={pending}>
              {t("disable")}
            </Button>
          </form>
        </details>
      )}
      {errorMessage}
    </div>
  );
}

function PasswordField({ id = "password", label }: { id?: string; label: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name="password" type="password" autoComplete="current-password" required />
    </div>
  );
}
