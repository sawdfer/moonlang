"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { type AnnouncementFormState, sendAnnouncementAction } from "./actions";

type Option = { id: string; name: string };
type Audience = "all" | "classGroups" | "students";

const MAX_LENGTH = 2000;

export function AnnouncementForm({
  classGroups,
  students,
}: {
  classGroups: Option[];
  students: Option[];
}) {
  const t = useTranslations("notifications.announcements");
  const [audience, setAudience] = useState<Audience>("all");
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState<AnnouncementFormState, FormData>(
    async (previous, form) => {
      const result = await sendAnnouncementAction(previous, form);
      if (result.status === "sent") {
        setBody("");
        setAudience("all");
      }
      return result;
    },
    { status: "idle" },
  );

  // Submitted by hand instead of `<form action>`, which resets every field after
  // the action, even on validation errors, and desyncs the audience choice.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => action(form));
  }

  const choices: { value: Audience; label: string }[] = [
    { value: "all", label: t("audienceAll") },
    { value: "classGroups", label: t("audienceClassGroups") },
    { value: "students", label: t("audienceStudents") },
  ];

  return (
    <form method="post" onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="announcement-body">{t("message")}</Label>
        <textarea
          id="announcement-body"
          name="body"
          required
          rows={5}
          maxLength={MAX_LENGTH}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t("messagePlaceholder")}
          className="rounded-lg border border-input bg-card px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-sm font-semibold">{t("audience")}</legend>
        <div className="flex flex-wrap gap-2">
          {choices.map((c) => (
            <label
              key={c.value}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm has-checked:border-primary has-checked:bg-primary/10 has-checked:font-semibold"
            >
              <input
                type="radio"
                name="audience"
                value={c.value}
                checked={audience === c.value}
                onChange={() => setAudience(c.value)}
                className="accent-primary"
              />
              {c.label}
            </label>
          ))}
        </div>

        {audience === "classGroups" && (
          <OptionList name="classGroupIds" options={classGroups} empty={t("noClassGroups")} />
        )}
        {audience === "students" && (
          <OptionList name="userIds" options={students} empty={t("noStudents")} />
        )}
      </fieldset>

      {state.status === "error" && (
        <p role="alert" className="text-sm text-destructive">
          {t(`errors.${state.code}`)}
        </p>
      )}
      {state.status === "sent" && (
        <div role="status" className="rounded-lg bg-success/10 px-4 py-3 text-sm">
          <p className="font-semibold">{t("sent", { count: state.recipients })}</p>
          <p className="mt-1">
            {t("whatsappQueued", { count: state.whatsapp })}{" "}
            {state.whatsapp > 0 && (
              <Link href="/teacher/whatsapp" className="font-semibold text-primary underline">
                {t("openQueue")}
              </Link>
            )}
          </p>
        </div>
      )}

      <Button type="submit" size="lg" disabled={pending} className="self-start">
        {pending ? t("sending") : t("submit")}
      </Button>
    </form>
  );
}

function OptionList({ name, options, empty }: { name: string; options: Option[]; empty: string }) {
  if (options.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
      {options.map((o) => (
        <li key={o.id}>
          <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted">
            <input type="checkbox" name={name} value={o.id} className="size-4 accent-primary" />
            {o.name}
          </label>
        </li>
      ))}
    </ul>
  );
}
