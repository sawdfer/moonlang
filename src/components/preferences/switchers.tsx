"use client";

import { Languages, Monitor, Moon, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useTransition } from "react";
import { LOCALES } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { setLocalePreference, setThemePreference } from "./actions";

const THEMES = ["system", "light", "dark"] as const;
type Theme = (typeof THEMES)[number];
const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon } as const;

const selectClass =
  "h-9 cursor-pointer appearance-none rounded-lg border bg-card py-1 pr-2 pl-8 text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";

/** Switches between Portuguese and English (F-010). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useTranslations("switchers");
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("language")}</span>
      <Languages className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden />
      <select
        value={locale}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            await setLocalePreference(next);
            router.refresh();
          });
        }}
        className={selectClass}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {t(`languages.${l}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Light, dark ("modo noite") or system theme (F-010). `savedTheme` is the
 * signed-in user's stored choice: it wins once on load, so the theme follows
 * the account across devices.
 */
export function ThemeSwitcher({ savedTheme, className }: { savedTheme?: Theme | null; className?: string }) {
  const t = useTranslations("switchers");
  const { theme, setTheme } = useTheme();
  const synced = useRef(false);
  // next-themes only knows the theme after mounting; render the default until then.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // eslint-disable-line react-hooks/set-state-in-effect -- hydration guard
    if (!synced.current && savedTheme && savedTheme !== theme) setTheme(savedTheme);
    synced.current = true;
  }, [savedTheme, theme, setTheme]);

  const current: Theme = mounted && THEMES.includes(theme as Theme) ? (theme as Theme) : "system";
  const Icon = THEME_ICONS[current];

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("theme")}</span>
      <Icon className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" aria-hidden />
      <select
        value={current}
        onChange={(event) => {
          const next = event.target.value as Theme;
          setTheme(next);
          void setThemePreference(next);
        }}
        className={selectClass}
      >
        {THEMES.map((value) => (
          <option key={value} value={value}>
            {t(`themes.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PreferenceSwitchers({ savedTheme, className }: { savedTheme?: Theme | null; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <LanguageSwitcher />
      <ThemeSwitcher savedTheme={savedTheme} />
    </div>
  );
}
