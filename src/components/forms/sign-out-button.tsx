"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/** Ends the current session and goes back to the public page (F-001). */
export function SignOutButton({ variant = "outline" }: { variant?: "outline" | "ghost" }) {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <Button type="button" variant={variant} size="sm" onClick={signOut} disabled={pending}>
      {t("signOut")}
    </Button>
  );
}
