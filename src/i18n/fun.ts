// Fun messages that vary by CEFR level (F-010). Texts live in messages/<locale>/experience.json
// under "fun.<key>.<band>". Humor only goes to empty states and celebrations, never to
// prices, dates or rules.

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

/** basic: mostly Portuguese · intermediate: mixed · advanced: mostly English and puns. */
export type FunBand = "basic" | "intermediate" | "advanced";

export const FUN_KEYS = [
  "noLessonsToday",
  "noUpcomingLessons",
  "noRequests",
  "noOpenCharges",
  "emptyQueue",
  "allSet",
  "welcome",
] as const;
export type FunKey = (typeof FUN_KEYS)[number];

/** F-010: students without a registered level get the basic messages. */
export function cefrBand(level: string | null | undefined): FunBand {
  switch (level) {
    case "B1":
    case "B2":
      return "intermediate";
    case "C1":
    case "C2":
      return "advanced";
    default:
      return "basic";
  }
}

/** Staff have no CEFR level; they get the mixed tone of the platform. */
export const STAFF_BAND: FunBand = "intermediate";

/** Message id inside the "fun" namespace, e.g. "noLessonsToday.basic". */
export function funMessageId(key: FunKey, band: FunBand): `${FunKey}.${FunBand}` {
  return `${key}.${band}`;
}
