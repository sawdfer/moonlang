import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { sql } from "drizzle-orm";
import { createDatabase, type Database } from "@/db/client";
import * as schema from "@/db/schema";

let cachedStatements: string[] | undefined;

async function schemaStatements() {
  if (!cachedStatements) {
    const empty = generateDrizzleJson({});
    const current = generateDrizzleJson(schema, empty.id, undefined, "snake_case");
    cachedStatements = await generateMigration(empty, current);
  }
  return cachedStatements;
}

/** Fresh in-memory database with the full schema. Use one per test file or test. */
export async function createTestDb(): Promise<Database> {
  const db = createDatabase("memory");
  for (const statement of await schemaStatements()) {
    await db.execute(sql.raw(statement));
  }
  return db;
}
