import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /**
   * Postgres connection string (Neon in production).
   * Leave empty in development to use the embedded PGlite database in .data/.
   */
  DATABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  /** Bearer token for scheduled jobs such as /api/cron/billing. Unset disables them. */
  CRON_SECRET: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(32).optional(),
  ),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${z.prettifyError(parsed.error)}`,
  );
}

// On Vercel (preview and production) the embedded database must never be used.
if (process.env.VERCEL && !parsed.data.DATABASE_URL) {
  throw new Error("DATABASE_URL is required on Vercel.");
}

export const env = parsed.data;
