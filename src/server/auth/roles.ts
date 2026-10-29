// Roles and the permissions shared by every feature (docs: 02-perfis-e-permissoes).
export const ROLES = ["root", "admin", "teacher", "student", "trial"] as const;
export type Role = (typeof ROLES)[number];

/** Roles that manage the platform and must use two-factor authentication. */
export const STAFF_ROLES = ["root", "admin", "teacher"] as const satisfies readonly Role[];
/** Roles with full access, including settings, prices and account removal. */
export const ADMIN_ROLES = ["root", "admin"] as const satisfies readonly Role[];

export function isStaff(role: Role): boolean {
  return (STAFF_ROLES as readonly Role[]).includes(role);
}

export function isAdmin(role: Role): boolean {
  return (ADMIN_ROLES as readonly Role[]).includes(role);
}

/** Online lessons page: the only area a trial account can use (RN-018). */
export const STUDENT_LESSONS_PATH = "/student/lessons";

/** Landing page after login for each role. */
export function homePathFor(role: Role): string {
  if (isStaff(role)) return "/teacher";
  if (role === "trial") return STUDENT_LESSONS_PATH;
  return "/student";
}
