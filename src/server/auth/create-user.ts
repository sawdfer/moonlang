import "server-only";
import { hashPassword } from "better-auth/crypto";
import { isPasswordCompromised } from "better-auth/plugins";
import { auth } from "./auth";
import type { Role } from "./roles";

export class PasswordPolicyError extends Error {
  constructor(readonly reason: "length" | "compromised" | "unavailable") {
    super(`Password rejected: ${reason}`);
  }
}

/**
 * Enforces the password policy (F-001): 12 to 128 characters and not found in
 * known data breaches. Throws `PasswordPolicyError`.
 */
export async function assertPasswordAllowed(password: string): Promise<void> {
  const ctx = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;
  if (password.length < minPasswordLength || password.length > maxPasswordLength) {
    throw new PasswordPolicyError("length");
  }
  let compromised: boolean;
  try {
    compromised = await isPasswordCompromised(password);
  } catch {
    // Fail closed: the breach check is part of the policy.
    throw new PasswordPolicyError("unavailable");
  }
  if (compromised) throw new PasswordPolicyError("compromised");
}

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
  await assertPasswordAllowed(input.password);
  const ctx = await auth.$context;
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
