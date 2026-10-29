// Pure rules for invites, age and consent (F-001). No DB and no clock: pass `now` in.
import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@/server/auth/roles";

/** Invite links are valid for 7 days and single use (RN-020). */
export const INVITE_TTL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type InviteStatus = "valid" | "used" | "expired";

export function inviteExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS);
}

/** A used invite stays "used" even after it would have expired. */
export function inviteStatus(
  invite: { expiresAt: Date; usedAt: Date | null },
  now: Date,
): InviteStatus {
  if (invite.usedAt) return "used";
  if (invite.expiresAt.getTime() <= now.getTime()) return "expired";
  return "valid";
}

/** Random token for the invite URL. Only its hash is stored (`hashInviteToken`). */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Minimum age to have an account (RN-019). */
export const MINIMUM_AGE = 18;

/**
 * Whole years between two calendar dates (YYYY-MM-DD). Someone born on 29 Feb
 * turns a year older on 1 Mar in non-leap years.
 */
export function ageOn(birthDate: string, today: string): number {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  let age = ty - by;
  if (tm < bm || (tm === bm && td < bd)) age -= 1;
  return age;
}

/** RN-019: only people aged 18 or more can create an account. `today` is the São Paulo date. */
export function isAdult(birthDate: string, today: string): boolean {
  return ageOn(birthDate, today) >= MINIMUM_AGE;
}

/** Roles that must accept the recording term and privacy policy (RN-023). */
const CONSENT_ROLES: readonly Role[] = ["student", "trial"];

/**
 * RN-023: students accept the current version of the terms; when the text changes,
 * they accept again on their next access (existing students included).
 */
export function needsConsent(
  role: Role,
  acceptedVersion: string | null,
  currentVersion: string,
): boolean {
  return CONSENT_ROLES.includes(role) && acceptedVersion !== currentVersion;
}
