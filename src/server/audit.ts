import "server-only";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

/** Records a sensitive action (RN-012). Never pass passwords, tokens or full documents in `data`. */
export async function recordAudit(entry: {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string;
  data?: Record<string, unknown>;
  reason?: string;
}) {
  await db.insert(auditLog).values(entry);
}
