import { TZDate } from "@date-fns/tz";

/** Every business date is computed in this time zone (RN-001). */
export const APP_TIME_ZONE = "America/Sao_Paulo";

/** The given instant (default: now) as a TZDate in America/Sao_Paulo. */
export function inAppTimeZone(date: Date | number = Date.now()): TZDate {
  return new TZDate(typeof date === "number" ? date : date.getTime(), APP_TIME_ZONE);
}

/** Calendar date (YYYY-MM-DD) of an instant in America/Sao_Paulo, as stored in `date` columns. */
export function toDateString(date: Date | number): string {
  const d = inAppTimeZone(date);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
