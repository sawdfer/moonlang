"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Ends every other session of this account (security requirements, 05-hospedagem). */
export function SessionsPanel() {
  const t = useTranslations("auth.security");
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");

  async function revokeOthers() {
    setState("pending");
    await authClient.revokeOtherSessions();
    setState("done");
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-display text-xl font-semibold">{t("sessionsTitle")}</h2>
      <p className="text-sm text-muted-foreground">{t("sessionsBody")}</p>
      {state === "done" ? (
        <p role="status" className="text-sm">
          {t("sessionsDone")}
        </p>
      ) : (
        <Button type="button" variant="outline" onClick={revokeOthers} disabled={state === "pending"}>
          {t("sessionsRevoke")}
        </Button>
      )}
    </div>
  );
}
