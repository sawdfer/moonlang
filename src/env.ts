import "server-only";
import { z } from "zod";

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  /**
   * Postgres connection string (the Postgres service in Coolify, ADR-004).
   * Leave empty in development to use the embedded PGlite database in .data/.
   */
  DATABASE_URL: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.url().optional(),
  ),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  /**
   * SMTP server for every e-mail (F-001, F-008). Any provider works (Resend,
   * Brevo, Amazon SES...). E-mails are only sent when SMTP_HOST and EMAIL_FROM
   * are set; otherwise they are printed to the console in development.
   */
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().default(587)),
  /** "true" for implicit TLS (usually port 465). Port 587 upgrades with STARTTLS. */
  SMTP_SECURE: z.preprocess(emptyToUndefined, z.enum(["true", "false"]).default("false")),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** Sender address on the platform domain, e.g. "Moonlang <ola@moonlang.com.br>". */
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.string().min(3).optional()),
  /** Where student replies go: the teacher's personal address (05-hospedagem-e-infra.md). */
  EMAIL_REPLY_TO: z.preprocess(emptyToUndefined, z.email().optional()),
  /** Bearer token required by the scheduled jobs under /api/cron. Jobs are refused while unset. */
  CRON_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(
    `Invalid environment variables:\n${z.prettifyError(parsed.error)}`,
  );
}

// Deployed containers must never fall back to the embedded database. The
// Dockerfile sets MOONLANG_CONTAINER only in the runtime image, so `next build`
// and a local `pnpm start` still work without DATABASE_URL.
if (process.env.MOONLANG_CONTAINER === "1" && !parsed.data.DATABASE_URL) {
  throw new Error("DATABASE_URL is required in the container.");
}

export const env = parsed.data;
