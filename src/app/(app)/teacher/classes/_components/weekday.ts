import { getFormatter } from "next-intl/server";
import { addDaysToDate, zonedDateTime } from "@/server/classes/rules";

export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/** Localized weekday name; 2026-11-01 is a Sunday (weekday 0). */
export async function weekdayName(weekday: number, style: "long" | "short" = "long"): Promise<string> {
  const format = await getFormatter();
  return format.dateTime(zonedDateTime(addDaysToDate("2026-11-01", weekday), "12:00"), { weekday: style });
}
