// Reschedule credits (student) and lesson credits (teacher/admin) — RN-007, RN-009, RN-011.
import { index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { user } from "./auth";
import { enrollment } from "./classes";

export const creditKind = pgEnum("credit_kind", ["reschedule", "lesson"]);
export const creditOrigin = pgEnum("credit_origin", [
  "student_cancellation",
  "teacher_cancellation",
  "schedule_block",
  "manual",
  "birthday",
]);
export const creditStatus = pgEnum("credit_status", [
  "available",
  "reserved",
  "used",
  "expired",
  "removed",
]);

export const credit = pgTable(
  "credit",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").references(() => enrollment.id, {
      onDelete: "cascade",
    }),
    kind: creditKind("kind").notNull(),
    origin: creditOrigin("origin").notNull(),
    sourceLessonId: text("source_lesson_id"),
    grantedById: text("granted_by_id").references(() => user.id),
    /** 30 days from creation or last renewal (RN-009, RN-011). */
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: creditStatus("status").notNull().default("available"),
    usedLessonId: text("used_lesson_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("credit_student_idx").on(t.studentId, t.status)],
);
