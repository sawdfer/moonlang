// Plans, charges, coupons, price changes and settings (F-007). Money is always integer cents.
import {
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./_shared";
import { user } from "./auth";
import { enrollment, lesson } from "./classes";
import { plan } from "./plans";

export const chargeKind = pgEnum("charge_kind", [
  "first_prorated",
  "monthly",
  "extra_lesson",
]);
export const chargeStatus = pgEnum("charge_status", [
  "pending",
  "paid",
  "overdue",
  "cancelled",
]);

/** Scheduled price changes, applied automatically from `effectiveFrom` (RN-016). */
export const priceChange = pgTable("price_change", {
  id: id(),
  planId: text("plan_id")
    .notNull()
    .references(() => plan.id),
  oldPriceCents: integer("old_price_cents").notNull(),
  newPriceCents: integer("new_price_cents").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  createdById: text("created_by_id")
    .notNull()
    .references(() => user.id),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** Enrollments kept at the old price for a given change (RN-016). */
export const priceChangeExemption = pgTable(
  "price_change_exemption",
  {
    // Surrogate id + unique pair: a composite primary key here makes
    // drizzle-kit re-create the constraint on every push (PGlite).
    id: id(),
    priceChangeId: text("price_change_id")
      .notNull()
      .references(() => priceChange.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollment.id, { onDelete: "cascade" }),
  },
  (t) => [unique("price_change_exemption_unique").on(t.priceChangeId, t.enrollmentId)],
);

export const charge = pgTable(
  "charge",
  {
    id: id(),
    studentId: text("student_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    enrollmentId: text("enrollment_id").references(() => enrollment.id, {
      onDelete: "set null",
    }),
    kind: chargeKind("kind").notNull(),
    /** Cycle covered by this charge (RN-025). */
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    amountCents: integer("amount_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    dueDate: date("due_date").notNull(),
    status: chargeStatus("status").notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    receivedCents: integer("received_cents"),
    note: text("note"),
    /** For extra lessons (RN-026). */
    lessonId: text("lesson_id").references(() => lesson.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("charge_student_idx").on(t.studentId, t.status),
    // Safety net: never two cycle charges for the same enrollment and period (F-007).
    uniqueIndex("charge_cycle_unique")
      .on(t.enrollmentId, t.periodStart)
      .where(sql`${t.kind} in ('first_prorated', 'monthly') and ${t.status} <> 'cancelled'`),
  ],
);

/** Percentage coupons applied for a number of monthly charges (RN-017). */
export const coupon = pgTable("coupon", {
  id: id(),
  code: text("code").notNull().unique(),
  percentOff: smallint("percent_off").notNull(),
  months: smallint("months").notNull(),
  validUntil: date("valid_until").notNull(),
  maxUses: integer("max_uses"),
  createdById: text("created_by_id")
    .notNull()
    .references(() => user.id),
  createdAt: createdAt(),
});

export const couponRedemption = pgTable("coupon_redemption", {
  id: id(),
  couponId: text("coupon_id")
    .notNull()
    .references(() => coupon.id),
  enrollmentId: text("enrollment_id")
    .notNull()
    .references(() => enrollment.id, { onDelete: "cascade" }),
  remainingMonths: smallint("remaining_months").notNull(),
  createdAt: createdAt(),
});

/**
 * Admin-configurable values. Known keys (see src/server/settings):
 * pixKey, extraHourPriceCents, dueDayOptions, maxLessonsPerDay, birthdayGiftEnabled.
 */
export const setting = pgTable("setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedById: text("updated_by_id").references(() => user.id),
  updatedAt: updatedAt(),
});
