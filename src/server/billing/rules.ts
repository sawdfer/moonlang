// Pure billing rules (F-007). No database and no clock: callers pass `today`.
// Dates are calendar days ("YYYY-MM-DD") in America/Sao_Paulo (RN-001).
import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, differenceInCalendarDays, getDaysInMonth } from "date-fns";
import { APP_TIME_ZONE, toDateString } from "@/lib/dates";
import { roundToWholeReais } from "@/lib/money";

/** Calendar day in America/Sao_Paulo, as stored in `date` columns. */
export type Day = string;

export type ChargeKind = "first_prorated" | "monthly" | "extra_lesson";
export type ChargeStatus = "pending" | "paid" | "overdue" | "cancelled";
export type EnrollmentStatus = "active" | "blocked" | "dropped";

/** Days before the due date when the monthly charge is generated and the student is told (F-007). */
export const MONTHLY_LEAD_DAYS = 3;
/** Monthly charges past due that block an enrollment (RN-015). */
export const OPEN_MONTHLY_CHARGES_TO_BLOCK = 2;

export function parseDay(day: Day): TZDate {
  const [y, m, d] = day.split("-").map(Number);
  return new TZDate(y!, m! - 1, d!, APP_TIME_ZONE);
}

export function shiftDay(day: Day, days: number): Day {
  return toDateString(addDays(parseDay(day), days));
}

export function daysBetween(from: Day, to: Day): number {
  return differenceInCalendarDays(parseDay(to), parseDay(from));
}

/** Due date in a given month; a due day past the end of a short month falls on its last day. */
function dueDateInMonth(monthStart: TZDate, dueDay: number): Day {
  const day = Math.min(dueDay, getDaysInMonth(monthStart));
  return toDateString(new TZDate(monthStart.getFullYear(), monthStart.getMonth(), day, APP_TIME_ZONE));
}

/** First due date on or after `from` (RN-025). */
export function nextDueDate(from: Day, dueDay: number): Day {
  const start = parseDay(from);
  const thisMonth = dueDateInMonth(new TZDate(start.getFullYear(), start.getMonth(), 1, APP_TIME_ZONE), dueDay);
  if (thisMonth >= from) return thisMonth;
  return dueDateInMonth(addMonths(new TZDate(start.getFullYear(), start.getMonth(), 1, APP_TIME_ZONE), 1), dueDay);
}

/** A cycle runs from one due date to the day before the next one (RN-025, "Ciclo"). */
export function cycleEnd(cycleStart: Day, dueDay: number): Day {
  return shiftDay(nextDueDate(shiftDay(cycleStart, 1), dueDay), -1);
}

export type GroupSchedule = {
  /** 0 = Sunday … 6 = Saturday (RN-004). */
  weekday: number;
  startsOn: Day;
  endsOn?: Day | null;
};

/** Weekly lessons of a class group between two days, both included. */
export function countWeeklyLessons(group: GroupSchedule, from: Day, to: Day): number {
  const first = from > group.startsOn ? from : group.startsOn;
  const last = group.endsOn && group.endsOn < to ? group.endsOn : to;
  if (first > last) return 0;
  const offset = (group.weekday - parseDay(first).getDay() + 7) % 7;
  const firstLesson = shiftDay(first, offset);
  if (firstLesson > last) return 0;
  return Math.floor(daysBetween(firstLesson, last) / 7) + 1;
}

/** lessons × (monthly ÷ 4), rounded to whole reais, never above the monthly price (RN-025, RN-013). */
export function proratedAmountCents(lessons: number, monthlyPriceCents: number): number {
  return Math.min(roundToWholeReais((lessons * monthlyPriceCents) / 4), monthlyPriceCents);
}

export type ChargeDraft = {
  kind: ChargeKind;
  periodStart: Day;
  periodEnd: Day;
  amountCents: number;
  dueDate: Day;
};

export type ProratedDraft = ChargeDraft & {
  /** Weekly lessons counted; 0 means the draft is the full first cycle. */
  lessons: number;
};

/**
 * Charge from `from` to the day before the next due date (RN-025). Without any
 * lesson in that period, it becomes the full monthly charge of the next cycle.
 */
function prorate(input: {
  from: Day;
  dueDay: number;
  group: GroupSchedule;
  monthlyPriceCents: number;
  dueDate: Day;
  kind: ChargeKind;
}): ProratedDraft {
  const due = nextDueDate(input.from, input.dueDay);
  const periodEnd = shiftDay(due, -1);
  const lessons = due > input.from ? countWeeklyLessons(input.group, input.from, periodEnd) : 0;
  if (lessons === 0) {
    return {
      kind: input.kind,
      periodStart: due,
      periodEnd: cycleEnd(due, input.dueDay),
      amountCents: input.monthlyPriceCents,
      dueDate: input.dueDate,
      lessons,
    };
  }
  return {
    kind: input.kind,
    periodStart: input.from,
    periodEnd,
    amountCents: proratedAmountCents(lessons, input.monthlyPriceCents),
    dueDate: input.dueDate,
    lessons,
  };
}

/** First prorated charge when a plan starts; it is due right away (RN-025). */
export function planFirstCharge(input: {
  startDate: Day;
  dueDay: number;
  group: GroupSchedule;
  monthlyPriceCents: number;
  today: Day;
}): ProratedDraft {
  return prorate({
    from: input.startDate,
    dueDay: input.dueDay,
    group: input.group,
    monthlyPriceCents: input.monthlyPriceCents,
    dueDate: input.today,
    kind: "first_prorated",
  });
}

/** What the billing rules need to know about an existing charge. */
export type ChargeFacts = {
  kind: ChargeKind;
  status: ChargeStatus;
  dueDate: Day;
  periodStart: Day | null;
  periodEnd: Day | null;
};

/** Unpaid charges become overdue the day after the due date (RN-015). */
export function effectiveStatus(charge: Pick<ChargeFacts, "status" | "dueDate">, today: Day): ChargeStatus {
  if (charge.status === "pending" && charge.dueDate < today) return "overdue";
  return charge.status;
}

/** Last day already covered by a first or monthly charge, or null if none. */
export function coveredUntil(charges: readonly ChargeFacts[]): Day | null {
  let last: Day | null = null;
  for (const c of charges) {
    if (c.kind === "extra_lesson" || c.status === "cancelled" || !c.periodEnd) continue;
    if (!last || c.periodEnd > last) last = c.periodEnd;
  }
  return last;
}

/** The plan is running once its first charge is paid (RN-018, RN-025), or when it never had one (existing students). */
export function planStarted(charges: readonly ChargeFacts[]): boolean {
  return !charges.some((c) => c.kind === "first_prorated" && (c.status === "pending" || c.status === "overdue"));
}

/**
 * Next monthly charge to create today, if any. Charges are prepaid: each one is
 * due on the first day of its cycle and costs the full price, even when the
 * cycle has a 5th weekly lesson (RN-013, RN-025). Blocked and dropped
 * enrollments get no new charges (RN-015, RN-027).
 */
export function nextMonthlyCharge(input: {
  status: EnrollmentStatus;
  charges: readonly ChargeFacts[];
  dueDay: number;
  monthlyPriceCents: number;
  group: GroupSchedule;
  today: Day;
}): ChargeDraft | null {
  if (input.status !== "active" || !planStarted(input.charges)) return null;
  const covered = coveredUntil(input.charges);
  if (!covered) return null;
  const start = shiftDay(covered, 1);
  if (input.group.endsOn && input.group.endsOn < start) return null;
  if (daysBetween(input.today, start) > MONTHLY_LEAD_DAYS) return null;
  return {
    kind: "monthly",
    periodStart: start,
    periodEnd: cycleEnd(start, input.dueDay),
    amountCents: input.monthlyPriceCents,
    dueDate: start,
  };
}

/** Monthly charges past their due date and unpaid. The first charge never counts (F-007). */
export function overdueMonthlyCount(charges: readonly ChargeFacts[], today: Day): number {
  return charges.filter((c) => c.kind === "monthly" && effectiveStatus(c, today) === "overdue").length;
}

/**
 * Blocks with 2 overdue monthly charges; lifts the block once none is left
 * (RN-015). Dropped enrollments never change (RN-027).
 */
export function blockingDecision(
  status: EnrollmentStatus,
  charges: readonly ChargeFacts[],
  today: Day,
): "block" | "unblock" | null {
  const overdue = overdueMonthlyCount(charges, today);
  if (status === "active" && overdue >= OPEN_MONTHLY_CHARGES_TO_BLOCK) return "block";
  if (status === "blocked" && overdue === 0) return "unblock";
  return null;
}

/**
 * After an unblock in the middle of a cycle nobody paid for, charges the
 * lessons left until the next due date, like the first charge (RN-015, RN-025).
 * Returns null when the current cycle is already covered.
 */
export function chargeAfterUnblock(input: {
  charges: readonly ChargeFacts[];
  dueDay: number;
  group: GroupSchedule;
  monthlyPriceCents: number;
  today: Day;
}): ProratedDraft | null {
  const covered = coveredUntil(input.charges);
  if (covered && covered >= input.today) return null;
  const draft = prorate({
    from: input.today,
    dueDay: input.dueDay,
    group: input.group,
    monthlyPriceCents: input.monthlyPriceCents,
    dueDate: input.today,
    kind: "monthly",
  });
  // No lesson left in this cycle: the next one is a regular prepaid charge.
  if (draft.lessons === 0) draft.dueDate = draft.periodStart;
  return draft;
}

/** Extra lesson price: hours × hourly price (RN-026). */
export function extraLessonPriceCents(durationMinutes: number, extraHourPriceCents: number): number {
  return Math.round((durationMinutes * extraHourPriceCents) / 60);
}

/**
 * Extra lessons are charged with the student's next monthly charge (RN-026):
 * the next due date on or after today whose monthly charge is not paid yet.
 */
export function extraLessonDueDate(input: {
  today: Day;
  dueDay: number;
  paidMonthlyDueDates: readonly Day[];
}): Day {
  let due = nextDueDate(input.today, input.dueDay);
  while (input.paidMonthlyDueDates.includes(due)) {
    due = nextDueDate(shiftDay(due, 1), input.dueDay);
  }
  return due;
}
