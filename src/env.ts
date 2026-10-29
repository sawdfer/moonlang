import "server-only";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

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
  /** Resend (F-008). E-mails are only sent when both are set; otherwise they are printed to the console. */
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Sender address on the platform domain, e.g. "Moonlang <ola@moonlang.com.br>". */
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  /** Bearer token required by the scheduled jobs under /api/cron. Jobs are refused while unset. */
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
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
