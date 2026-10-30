// Class groups (turmas), enrollments, lessons and attendance (F-003, F-004, F-005).
import {
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { user } from "./auth";
import { cefrLevel } from "./people";
import { plan } from "./plans";

export const lessonType = pgEnum("lesson_type", [
  "conversation",
  "grammar",
  "business",
]);
export const enrollmentStatus = pgEnum("enrollment_status", [
  "active",
  "blocked",
  "dropped",
]);
export const lessonKind = pgEnum("lesson_kind", [
  "weekly",
  "extra",
  "one_off",
  "trial",
  "makeup",
]);
export const lessonStatus = pgEnum("lesson_status", [
  "pending",
  "confirmed",
  "rejected",
  "done",
  "cancelled_by_student",
  "cancelled_by_teacher",
]);
export const attendanceStatus = pgEnum("attendance_status", [
  "expected",
  "present",
  "absent",
  "late_absent",
  "cancelled_in_time",
  "cancelled_late",
]);

/** A fixed group of 1–3 students with one weekly lesson (RN-004). */
export const classGroup = pgTable("class_group", {
  id: id(),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => user.id),
  name: text("name").notNull(),
  lessonType: lessonType("lesson_type").notNull(),
  cefrLevel: cefrLevel("cefr_level"),
  /** 60 or 120 (RN-002). */
  durationMinutes: smallint("duration_minutes").notNull(),
  /** 0 = Sunday … 6 = Saturday, in America/Sao_Paulo (RN-001). */
  weekday: smallint("weekday").notNull(),
  startTime: time("start_time").notNull(),
  /** Google Meet or Zoom link; only shown inside the platform (RN-024). */
  meetingUrl: text("meeting_url"),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A student's participation in a class group, with its own plan and charges (RN-004, RN-027). */
export const enrollment = pgTable(
  "enrollment",
  {
    id: id(),
    classGroupId: text("class_group_id")
      .notNull()
      .references(() => classGroup.id),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plan.id),
    status: enrollmentStatus("status").notNull().default("active"),
    /** Keeps an old price for this student after a price change (RN-016). */
    priceOverrideCents: integer("price_override_cents"),
    startedOn: date("started_on").notNull(),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.classGroupId, t.studentId)],
);

/**
 * Every lesson, materialized per occurrence. Weekly lessons are generated from
 * the class group; requests from students start as "pending" (RN-006).
 */
export const lesson = pgTable(
  "lesson",
  {
    id: id(),
    classGroupId: text("class_group_id").references(() => classGroup.id),
    teacherId: text("teacher_id")
      .notNull()
      .references(() => user.id),
    kind: lessonKind("kind").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    durationMinutes: smallint("duration_minutes").notNull(),
    /** Overrides the class group link for this lesson only. */
    meetingUrl: text("meeting_url"),
    status: lessonStatus("status").notNull().default("confirmed"),
    /** For individual lessons (extra, makeup, trial). */
    studentId: text("student_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    requestedById: text("requested_by_id").references(() => user.id),
    decidedById: text("decided_by_id").references(() => user.id),
    decisionNote: text("decision_note"),
    /** Credit consumed by this lesson, if any (RN-011). */
    creditId: text("credit_id"),
    /** Price of an extra lesson (RN-026). */
    priceCents: integer("price_cents"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledById: text("cancelled_by_id").references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("lesson_starts_at_idx").on(t.startsAt),
    unique("lesson_weekly_occurrence").on(t.classGroupId, t.startsAt),
  ],
);

/** Per-student attendance for each lesson (RN-008, RN-010). */
export const lessonAttendance = pgTable(
  "lesson_attendance",
  {
    lessonId: text("lesson_id")
      .notNull()
      .references(() => lesson.id, { onDelete: "cascade" }),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: attendanceStatus("status").notNull().default("expected"),
    markedById: text("marked_by_id").references(() => user.id),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: "lesson_attendance_pk", columns: [t.lessonId, t.studentId] }),
  ],
);

export const scheduleBlockKind = pgEnum("schedule_block_kind", ["vacation", "holiday"]);

/** Days the teacher is unavailable; weekly lessons on these days are cancelled (F-004). */
export const scheduleBlock = pgTable("schedule_block", {
  id: id(),
  /** A vacation makes every open credit expire when it starts (V2); a holiday does not. */
  kind: scheduleBlockKind("kind").notNull().default("holiday"),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => user.id),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  reason: text("reason"),
  createdAt: createdAt(),
});
