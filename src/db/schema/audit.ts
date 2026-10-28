// Audit trail for sensitive actions: manual adjustments, payments, role changes, deletions (RN-012).
import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";
import { user } from "./auth";

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    /** Before/after values. Never store passwords, tokens or full documents here. */
    data: jsonb("data"),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId)],
);
