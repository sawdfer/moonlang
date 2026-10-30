import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, phoneNumber, twoFactor } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";
import { sendMail } from "@/server/notifications/mail";
import { canDisableTwoFactor } from "./access";
import { localeOf, mailTranslator } from "./mail-text";
import { isStaff, type Role } from "./roles";

/** Marks the reset link sent to a new staff account, so the e-mail reads as a welcome. */
export const WELCOME_RESET_PATH = "/reset-password?welcome=1";

export const auth = betterAuth({
  appName: "Moonlang",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      twoFactor: schema.twoFactor,
      rateLimit: schema.rateLimit,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are only created from invites (RN-020), never by public sign-up.
    disableSignUp: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    // Reset and welcome links last 24 hours (RN-020, V12).
    resetPasswordTokenExpiresIn: 60 * 60 * 24,
    // Password recovery is by e-mail (F-001).
    sendResetPassword: async ({ user, url }) => {
      const t = mailTranslator(await localeOf(user.id));
      const welcome = url.includes(encodeURIComponent(WELCOME_RESET_PATH));
      // Staff accounts (F-001) and students registered by the teacher (F-002) get different welcomes.
      const kind = !welcome ? "reset" : isStaff((user as { role?: string }).role as Role) ? "welcome" : "welcomeStudent";
      await sendMail({
        to: user.email,
        subject: t(`${kind}Subject`),
        text: t(`${kind}Body`, { name: user.name, url }),
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "trial",
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 60,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-in/phone-number": { window: 60, max: 5 },
      "/two-factor/verify-totp": { window: 60, max: 5 },
      "/request-password-reset": { window: 300, max: 3 },
    },
  },
  hooks: {
    // F-001: two-factor is mandatory for staff, so they cannot turn it off.
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/two-factor/disable") return;
      const session = await getSessionFromCtx(ctx);
      if (session && !canDisableTwoFactor(session.user.role as Role)) {
        throw new APIError("FORBIDDEN", { message: "Two-factor is mandatory for staff." });
      }
    }),
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    cookiePrefix: "moonlang",
  },
  plugins: [
    twoFactor({ issuer: "Moonlang" }),
    phoneNumber({
      // Phone numbers are a login identifier with a password (13.2).
      // OTP by SMS is not used, so sending is intentionally unsupported.
      sendOTP: async () => {
        throw new Error("SMS one-time codes are not supported.");
      },
    }),
    haveIBeenPwned(),
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
