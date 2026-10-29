import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/server/auth/session";
import { listPlacementOptions } from "@/server/people/students";
import { RegisterStudentForm } from "./register-form";

export const metadata: Metadata = { title: "Cadastrar aluno" };

/** Manual registration without an invite (F-002, RN-020). */
export default async function NewStudentPage() {
  const actor = await requireStaff();
  const [t, options] = await Promise.all([getTranslations("people.register"), listPlacementOptions(actor)]);
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
      <Link href="/teacher/students" className="text-sm text-muted-foreground hover:underline">
        ← {t("back")}
      </Link>
      <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
      <Card>
        <RegisterStudentForm options={options} />
      </Card>
    </main>
  );
}
