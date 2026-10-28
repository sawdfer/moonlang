// Students, invites, consents and contact attempts (F-001, F-002, F-006).
import {
  boolean,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";
import { user } from "./auth";

export const cefrLevel = pgEnum("cefr_level", [
  "A1",
  "A2",
  "B1",
  "B2",
  "C1",
  "C2",
]);
export const locale = pgEnum("locale", ["pt-BR", "en"]);
export const themePreference = pgEnum("theme_preference", [
  "system",
  "light",
  "dark",
]);
export const inviteKind = pgEnum("invite_kind", ["student", "trial"]);
export const contactChannel = pgEnum("contact_channel", [
  "whatsapp",
  "email",
  "phone_call",
]);
export const trialOutcome = pgEnum("trial_outcome", [
  "pending",
  "converted",
  "not_converted",
]);

/** Extra data for anyone with role "student" or "trial" (RN-019, RN-021, RN-025). */
export const studentProfile = pgTable("student_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  birthDate: date("birth_date").notNull(),
  goal: text("goal"),
  cefrLevel: cefrLevel("cefr_level"),
  /** Day of month the monthly charge is due (RN-025). */
  dueDay: integer("due_day"),
  dueDayChangedAt: timestamp("due_day_changed_at", { withTimezone: true }),
  /** Teacher-only notes, never shown to the student (F-002). */
  privateNotes: text("private_notes"),
  lastAccessAt: timestamp("last_access_at", { withTimezone: true }),
  /** Set when the admin chose to keep an account inactive for 1+ year (RN-021). */
  retentionReviewedAt: timestamp("retention_reviewed_at", {
    withTimezone: true,
  }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const userPreference = pgTable("user_preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  locale: locale("locale").notNull().default("pt-BR"),
  theme: themePreference("theme").notNull().default("system"),
  nonEssentialEmails: boolean("non_essential_emails").notNull().default(true),
  updatedAt: updatedAt(),
});

/** Single-use invite links, valid for 7 days (RN-020). Only the token hash is stored. */
export const invite = pgTable("invite", {
  id: id(),
  tokenHash: text("token_hash").notNull().unique(),
  kind: inviteKind("kind").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  phoneNumber: text("phone_number"),
  invitedById: text("invited_by_id")
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: text("used_by_user_id").references(() => user.id, {
    onDelete: "set null",
  }),
  createdAt: createdAt(),
});

/** Accepted versions of the recording term and privacy policy (RN-023). */
export const consent = pgTable("consent", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  documentVersion: text("document_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Re-engagement attempts with inactive students (F-002, metric in F-009). */
export const contactAttempt = pgTable("contact_attempt", {
  id: id(),
  studentId: text("student_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  channel: contactChannel("channel").notNull(),
  outcome: text("outcome"),
  note: text("note"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
});

/** Result of each trial lesson; enforces 1 trial every 3 months (RN-018). */
export const trialRecord = pgTable("trial_record", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  lessonId: text("lesson_id"),
  cefrLevel: cefrLevel("cefr_level"),
  outcome: trialOutcome("outcome").notNull().default("pending"),
  notes: text("notes"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
