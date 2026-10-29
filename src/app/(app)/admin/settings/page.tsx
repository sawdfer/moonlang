import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/server/auth/session";
import { getBillingSettings } from "@/server/billing/settings";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Configurações" };

/** Admin-only billing settings: Pix key, extra hour price, due day options (RN-016, RN-025, RN-026). */
export default async function AdminSettingsPage() {
  await requireAdmin();
  const [t, settings] = await Promise.all([getTranslations("billing.admin"), getBillingSettings()]);

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="font-display text-3xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>
      <Card>
        <SettingsForm
          pixKey={settings.pixKey ?? ""}
          extraHourPrice={(settings.extraHourPriceCents / 100).toFixed(2).replace(".", ",")}
          dueDayOptions={settings.dueDayOptions.join(", ")}
        />
      </Card>
    </main>
  );
}
