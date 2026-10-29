// Pure visibility rules for staff looking at students (02-perfis, F-002).
import { isAdmin, type Role } from "@/server/auth/roles";

/**
 * Admins and root see every student. A teacher sees the students of her own
 * class groups, plus those not yet in any group (trial and newly registered
 * people), so she can place them. This prepares the ground for more teachers (1.4).
 */
export function staffSeesStudent(
  actor: { id: string; role: Role },
  groupTeacherIds: readonly string[],
): boolean {
  if (isAdmin(actor.role)) return true;
  if (actor.role !== "teacher") return false;
  return groupTeacherIds.length === 0 || groupTeacherIds.includes(actor.id);
}
