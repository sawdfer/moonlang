// In-app notifications, WhatsApp queue and announcements (F-008).
import { jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createdAt, id } from "./_shared";
import { user } from "./auth";

export const emailStatus = pgEnum("email_status", [
  "none",
  "pending",
  "sent",
  "failed",
]);
export const whatsappStatus = pgEnum("whatsapp_status", [
  "pending",
  "sent",
  "discarded",
]);

export const notification = pgTable("notification", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  /** Always a link inside the platform, never a meeting URL (RN-024). */
  link: text("link"),
  readAt: timestamp("read_at", { withTimezone: true }),
  emailStatus: emailStatus("email_status").notNull().default("none"),
  createdAt: createdAt(),
});

/** Ready-made messages the teacher sends from her own WhatsApp via wa.me links (P7). */
export const whatsappMessage = pgTable("whatsapp_message", {
  id: id(),
  recipientId: text("recipient_id").references(() => user.id, {
    onDelete: "cascade",
  }),
  phoneNumber: text("phone_number").notNull(),
  body: text("body").notNull(),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id"),
  status: whatsappStatus("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  sentById: text("sent_by_id").references(() => user.id),
  createdAt: createdAt(),
});

export const announcement = pgTable("announcement", {
  id: id(),
  authorId: text("author_id")
    .notNull()
    .references(() => user.id),
  body: text("body").notNull(),
  /** { all: true } | { classGroupIds: string[] } | { userIds: string[] } */
  audience: jsonb("audience").notNull(),
  createdAt: createdAt(),
});
