// Pure access rules (F-001). Used by session.ts and the staff account pages.
import { isStaff, type Role } from "./roles";

export type AccessGate = "two-factor" | "consent";

/** Page each gate sends the user to. Both pages must not call `requireUser`. */
export const GATE_PATHS: Record<AccessGate, string> = {
  "two-factor": "/account/security",
  consent: "/consent",
};

/**
 * What must happen before a signed-in user can use the platform:
 * staff without two-factor enroll first (F-001), students with an outdated
 * consent accept the current terms (RN-023).
 */
export function accessGate(input: {
  role: Role;
  twoFactorEnabled: boolean;
  needsConsent: boolean;
}): AccessGate | null {
  if (isStaff(input.role) && !input.twoFactorEnabled) return "two-factor";
  if (input.needsConsent) return "consent";
  return null;
}

/** F-001: only root creates admins; root and admins create teachers. Nobody creates root. */
export function creatableStaffRoles(actor: Role): Role[] {
  if (actor === "root") return ["admin", "teacher"];
  if (actor === "admin") return ["teacher"];
  return [];
}

export function canCreateStaff(actor: Role, target: Role): boolean {
  return creatableStaffRoles(actor).includes(target);
}

/** F-001: two-factor is mandatory for staff, so only students may turn it off. */
export function canDisableTwoFactor(role: Role): boolean {
  return !isStaff(role);
}
