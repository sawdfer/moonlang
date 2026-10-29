"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/forms/action-form";
import { FormError } from "@/components/forms/form-message";
import { createInviteAction, type CreateInviteState } from "./actions";

const initialState: CreateInviteState = { errors: {} };

export function InviteForm() {
  const t = useTranslations("auth.team");
  const [state, action, pending] = useActionState(createInviteAction, initialState);
  const [copied, setCopied] = useState(false);
  const e = state.errors;

  if (state.created) {
    const { url, whatsapp, emailed } = state.created;
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold">{t("inviteCreated")}</h2>
        <p className="text-sm text-muted-foreground">{t("inviteCreatedHelp")}</p>
        <code className="break-all rounded-lg bg-muted p-3 font-mono text-sm select-all">{url}</code>
        {emailed && <p className="text-sm">{t("inviteEmailed")}</p>}
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? t("copied") : t("copyLink")}
          </Button>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "accent" })}>
              {t("sendWhatsApp")}
            </a>
          )}
        </div>
        <Button type="button" variant="ghost" onClick={() => window.location.reload()}>
          {t("newInvite")}
        </Button>
      </div>
    );
  }

  return (
    <ActionForm action={action} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{t("kindLabel")}</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="kind" value="student" defaultChecked className="accent-primary" />
          {t("kind.student")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="kind" value="trial" className="accent-primary" />
          {t("kind.trial")}
        </label>
      </fieldset>
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{t("name")}</Label>
        <Input id="name" name="name" required />
        <FormError code={e.name} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">{t("email")}</Label>
        <Input id="email" name="email" type="email" />
        <FormError code={e.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phoneNumber">{t("phone")}</Label>
        <Input id="phoneNumber" name="phoneNumber" type="tel" />
        <FormError code={e.phoneNumber} />
      </div>
      <p className="text-xs text-muted-foreground">{t("contactHint")}</p>
      <Button type="submit" disabled={pending}>
        {t("createInvite")}
      </Button>
    </ActionForm>
  );
}
