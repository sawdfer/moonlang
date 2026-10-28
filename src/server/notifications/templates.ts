// Message catalog for notifications, e-mails and WhatsApp drafts, in the
// recipient's language (F-008, F-010). Texts live in messages/<locale>/notifications.json.
import enMessages from "../../../messages/en/notifications.json";
import ptMessages from "../../../messages/pt-BR/notifications.json";
import { APP_TIME_ZONE } from "@/lib/dates";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/i18n/config";

const catalogs = {
  "pt-BR": ptMessages.notifications,
  en: enMessages.notifications,
} as const;

type Templates = (typeof catalogs)["pt-BR"]["templates"];
export type TemplateKey = keyof Templates;
type Part = "title" | "body" | "whatsapp";

export type TemplateParams = Record<string, string | number>;

/** A template reference other domains can pass to `notify()` instead of fixed texts. */
export type NotificationTemplate = {
  key: TemplateKey;
  params?: TemplateParams;
  /** Lesson or due date; fills {date}, {weekday} and {time} in São Paulo time. */
  at?: Date;
};

export function resolveLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Replaces {name} placeholders; unknown placeholders are left as they are. */
export function interpolate(text: string, params: TemplateParams): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** {date}, {weekday} and {time} of an instant, always in America/Sao_Paulo (RN-001). */
export function dateParams(at: Date, locale: Locale): TemplateParams {
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: APP_TIME_ZONE, ...options }).format(at);
  return {
    date: format({ day: "2-digit", month: "2-digit" }),
    weekday: format({ weekday: "long" }),
    time: format({ hour: "2-digit", minute: "2-digit" }),
  };
}

function templateParams(template: NotificationTemplate, locale: Locale): TemplateParams {
  return { ...(template.at ? dateParams(template.at, locale) : {}), ...template.params };
}

/** Title and body of a notification in the given language. */
export function renderTemplate(
  template: NotificationTemplate,
  locale: Locale,
): { title: string; body: string } {
  const entry = catalogs[locale].templates[template.key];
  const params = templateParams(template, locale);
  return { title: interpolate(entry.title, params), body: interpolate(entry.body, params) };
}

/** WhatsApp draft text, for the templates that have one. */
export function renderWhatsAppText(
  template: NotificationTemplate,
  locale: Locale,
): string | null {
  const entry = catalogs[locale].templates[template.key] as Partial<Record<Part, string>>;
  if (!entry.whatsapp) return null;
  return interpolate(entry.whatsapp, templateParams(template, locale));
}

export function emailStrings(locale: Locale) {
  return catalogs[locale].email;
}
