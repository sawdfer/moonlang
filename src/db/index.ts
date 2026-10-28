import "server-only";
import { env } from "@/env";
import { createDatabase, type Database } from "./client";

export type { Database } from "./client";

const globalForDb = globalThis as unknown as { moonlangDb?: Database };

function instance(): Database {
  if (!globalForDb.moonlangDb) {
    globalForDb.moonlangDb = createDatabase(env.DATABASE_URL ?? null);
  }
  return globalForDb.moonlangDb;
}

/**
 * Shared database instance, created on first use. Being lazy keeps `next build`
 * from opening the local PGlite directory in several workers at once.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, property) {
    const target = instance();
    const value = Reflect.get(target, property, target);
    return typeof value === "function" ? value.bind(target) : value;
  },
});
