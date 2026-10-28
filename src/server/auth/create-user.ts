import "server-only";
import { hashPassword } from "better-auth/crypto";
import { isPasswordCompromised } from "better-auth/plugins";
import { auth } from "./auth";
import type { Role } from "./roles";

/**
 * Creates a user with an e-mail/password credential, bypassing the disabled
 * public sign-up. Only call this from trusted server code (invite acceptance,
 * manual registration by staff, seeding).
 *
 * Plugin hooks do not run here, so the password policy is enforced explicitly.
 */
export async function createUserWithPassword(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  phoneNumber?: string;
}) {
  const ctx = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;
  if (
    input.password.length < minPasswordLength ||
    input.password.length > maxPasswordLength
  ) {
    throw new Error("Password does not meet the length policy.");
  }
  if (await isPasswordCompromised(input.password)) {
    throw new Error("Password appears in a known data breach.");
  }
  // Same default hasher Better Auth uses; ctx.password.hash needs an HTTP request context.
  const hashed = await hashPassword(input.password);
  const user = await ctx.internalAdapter.createUser({
    name: input.name,
    email: input.email.toLowerCase(),
    emailVerified: false,
    role: input.role,
    phoneNumber: input.phoneNumber ?? null,
  }, { method: "email-password" });
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hashed,
  });
  return user;
}
