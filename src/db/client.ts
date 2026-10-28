import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import * as schema from "./schema";

/** Local PGlite data directory used when no DATABASE_URL is set. */
export const LOCAL_DB_DIR = ".data/pglite";

/**
 * Creates a Drizzle client.
 * - With a connection string: Neon serverless driver (supports transactions).
 * - With `null`: embedded PGlite stored in `.data/pglite` (local development).
 * - With `"memory"`: in-memory PGlite (tests).
 */
/** Common type for both drivers, so app code never depends on which one is used. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

export function createDatabase(
  connection: string | "memory" | null,
): Database {
  if (connection && connection !== "memory") {
    return drizzleNeon({
      client: new Pool({ connectionString: connection }),
      schema,
      casing: "snake_case",
    }) as unknown as Database;
  }
  const client =
    connection === "memory" ? new PGlite() : new PGlite(LOCAL_DB_DIR);
  return drizzlePglite({
    client,
    schema,
    casing: "snake_case",
  }) as unknown as Database;
}
