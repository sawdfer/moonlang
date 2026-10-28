// Plans live in their own module so classes and billing can both reference them.
import { boolean, integer, pgTable, smallint, text } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./_shared";

export const plan = pgTable("plan", {
  id: id(),
  name: text("name").notNull(),
  /** 60 or 120 (RN-002, RN-013). */
  durationMinutes: smallint("duration_minutes").notNull(),
  priceCents: integer("price_cents").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});
