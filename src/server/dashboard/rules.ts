// Pure helpers of the teacher dashboard (F-009). No database, no clock: `now` comes in.
import { addDays, startOfDay } from "date-fns";
import { inAppTimeZone, toDateString } from "@/lib/dates";

/** "Novos alunos" are the ones who accepted an invite in the last 7 days (F-009). */
export const NEW_STUDENT_DAYS = 7;

/** Start and end of the São Paulo calendar day containing `now` (RN-001). */
export function appDayRange(now: Date): { from: Date; to: Date } {
  const start = startOfDay(inAppTimeZone(now));
  return { from: new Date(start.getTime()), to: new Date(addDays(start, 1).getTime()) };
}

export function newStudentsSince(now: Date): Date {
  return new Date(now.getTime() - NEW_STUDENT_DAYS * 24 * 60 * 60 * 1000);
}

/** `amountCents` is what the student owes, as shown on the finance page (F-007). */
export type OpenChargeFacts = { status: string; dueDate: string; amountCents: number };

/** Pending charges past their due date count as overdue, as in F-007. */
export function chargeState(charge: Pick<OpenChargeFacts, "status" | "dueDate">, now: Date): "pending" | "overdue" {
  return charge.status === "overdue" || charge.dueDate < toDateString(now) ? "overdue" : "pending";
}

/** Counts and total of open charges for the summary line. */
export function summarizeCharges(charges: OpenChargeFacts[], now: Date) {
  let overdue = 0;
  let totalCents = 0;
  for (const c of charges) {
    if (chargeState(c, now) === "overdue") overdue++;
    totalCents += c.amountCents;
  }
  return { open: charges.length, overdue, totalCents };
}
