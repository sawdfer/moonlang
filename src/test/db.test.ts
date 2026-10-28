import { describe, expect, it } from "vitest";
import { plan } from "@/db/schema";
import { createTestDb } from "./db";

describe("test database", () => {
  it("creates the full schema in memory", async () => {
    const db = await createTestDb();
    await db.insert(plan).values({ name: "1h", durationMinutes: 60, priceCents: 16900 });
    const rows = await db.select().from(plan);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.priceCents).toBe(16900);
  });
});
