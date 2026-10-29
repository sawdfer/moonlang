import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { creatableStaffRoles } from "@/server/auth/access";
import { requireAdmin } from "@/server/auth/session";
import { listStaff } from "@/server/people/staff";
import { StaffForm } from "./staff-form";

export const metadata: Metadata = { title: "Equipe" };

/** Staff accounts (F-001). Only root and admins get here. */
export default async function StaffPage() {
  const actor = await requireAdmin();
  const [t, staff] = await Promise.all([getTranslations("auth.team"), listStaff()]);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12">
      <h1 className="font-display text-3xl font-semibold">{t("staffTitle")}</h1>
      <Card>
        <StaffForm roles={creatableStaffRoles(actor.role) as ("admin" | "teacher")[]} />
      </Card>
      <ul className="divide-y rounded-xl border bg-card">
        {staff.map((member) => (
          <li key={member.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <span>
              <span className="font-medium">{member.name}</span>{" "}
              <span className="text-muted-foreground">{member.email}</span>
            </span>
            <span className="text-muted-foreground">
              {t(`role.${member.role}`)} · {t(member.twoFactorEnabled ? "twoFactorOn" : "twoFactorPending")}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
