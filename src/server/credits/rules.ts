// Pure credit rules (RN-011). No database and no clock here.
import { addDays } from "date-fns";

/** Credits are valid for 30 days (RN-009, RN-011). */
export const CREDIT_VALIDITY_DAYS = 30;

/**
 * Expiry of a lesson credit granted because the teacher cancelled a lesson or
 * blocked the day (RN-011). The 30 days count from the grant, or from the
 * cancelled lesson when it is still in the future, so a credit for a lesson
 * months ahead does not expire before that lesson would have happened.
 */
export function lessonCreditExpiresAt(input: {
  now: Date;
  lessonStartsAt: Date;
  /** Start instants of the teacher's vacations (V2). */
  vacationStarts?: readonly Date[];
}): Date {
  const base = input.lessonStartsAt > input.now ? input.lessonStartsAt : input.now;
  return capAtVacation(addDays(base, CREDIT_VALIDITY_DAYS), input.now, input.vacationStarts ?? []);
}

/**
 * Every open credit expires when the teacher's next vacation starts, even
 * before its 30 days (RN-011, V2). Holidays do not count as vacations.
 */
export function capAtVacation(expiresAt: Date, now: Date, vacationStarts: readonly Date[]): Date {
  const next = vacationStarts.filter((v) => v > now && v < expiresAt).sort((a, b) => a.getTime() - b.getTime())[0];
  return next ?? expiresAt;
}
