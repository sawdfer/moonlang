import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { haveIBeenPwned, phoneNumber, twoFactor } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";

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
    // TODO(F-001): send the reset e-mail through the notifications module.
    sendResetPassword: async () => {
      throw new Error("Password reset e-mail is not configured yet.");
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
