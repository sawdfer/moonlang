// Pure rules for student management (F-002). No DB and no clock: pass `now` in.
import { addDays, addMonths, addYears } from "date-fns";
import type { Role } from "@/server/auth/roles";

/** RN-021: an account without access for 30 days is inactive. */
export const INACTIVE_AFTER_DAYS = 30;
/** `last_access_at` is written at most once per hour, to keep page loads cheap. */
export const LAST_ACCESS_TOUCH_MS = 60 * 60 * 1000;
/** RN-025: the student changes the due day at most once every 3 months. */
export const DUE_DAY_CHANGE_MONTHS = 3;

export type EnrollmentState = "active" | "blocked" | "dropped";
export type StudentStatus = "trial" | "active" | "blocked" | "dropped";
export type StudentFilter = "all" | "trial" | "active" | "inactive" | "blocked" | "dropped";

export const STUDENT_FILTERS: readonly StudentFilter[] = [
  "all",
  "trial",
  "active",
  "inactive",
  "blocked",
  "dropped",
];

export function shouldTouchLastAccess(lastAccessAt: Date | null, now: Date): boolean {
  return !lastAccessAt || now.getTime() - lastAccessAt.getTime() >= LAST_ACCESS_TOUCH_MS;
}

/**
 * RN-021: when the account became inactive. Accounts that never signed in
 * count from their creation.
 */
export function inactiveSince(lastSeen: Date): Date {
  return addDays(lastSeen, INACTIVE_AFTER_DAYS);
}

export function isInactive(lastSeen: Date, now: Date): boolean {
  return inactiveSince(lastSeen).getTime() <= now.getTime();
}

/**
 * Situation shown in the student list (F-002): trial (RN-018), blocked when any
 * participation is blocked for non-payment (RN-015), dropped when they left
 * every class group (RN-027), otherwise active. Inactivity (RN-021) is a
 * separate flag, because a blocked or dropped student can also stop signing in.
 */
export function studentSituation(input: {
  role: Role;
  enrollments: readonly EnrollmentState[];
  lastSeen: Date;
  now: Date;
}): { status: StudentStatus; inactive: boolean } {
  const inactive = isInactive(input.lastSeen, input.now);
  if (input.role === "trial") return { status: "trial", inactive };
  if (input.enrollments.includes("blocked")) return { status: "blocked", inactive };
  if (input.enrollments.length > 0 && input.enrollments.every((e) => e === "dropped")) {
    return { status: "dropped", inactive };
  }
  return { status: "active", inactive };
}

export function matchesFilter(
  situation: { status: StudentStatus; inactive: boolean },
  filter: StudentFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "inactive":
      return situation.inactive;
    case "active":
      return situation.status === "active" && !situation.inactive;
    default:
      return situation.status === filter;
  }
}

/** RN-021: first notice 1 year after becoming inactive. */
export const RETENTION_FIRST_NOTICE_YEARS = 1;
/** RN-021: when the admin keeps the account, a new notice every 6 months. */
export const RETENTION_REPEAT_MONTHS = 6;

/**
 * When the admin must decide about an inactive account (RN-021). A decision to
 * keep it only counts if it was made during the current inactivity: signing in
 * again starts a new period.
 */
export function retentionDueAt(lastSeen: Date, keptAt: Date | null): Date {
  const since = inactiveSince(lastSeen);
  if (keptAt && keptAt.getTime() >= since.getTime()) {
    return addMonths(keptAt, RETENTION_REPEAT_MONTHS);
  }
  return addYears(since, RETENTION_FIRST_NOTICE_YEARS);
}

export function isRetentionDue(lastSeen: Date, keptAt: Date | null, now: Date): boolean {
  return retentionDueAt(lastSeen, keptAt).getTime() <= now.getTime();
}

/** RN-025: first instant the due day may change again; null when it never changed. */
export function dueDayChangeAllowedFrom(changedAt: Date | null): Date | null {
  return changedAt ? addMonths(changedAt, DUE_DAY_CHANGE_MONTHS) : null;
}

/** RN-025: students wait 3 months between changes; admins may change it any time. */
export function canChangeDueDay(input: {
  changedAt: Date | null;
  now: Date;
  isAdmin: boolean;
}): boolean {
  if (input.isAdmin) return true;
  const from = dueDayChangeAllowedFrom(input.changedAt);
  return !from || from.getTime() <= input.now.getTime();
}
