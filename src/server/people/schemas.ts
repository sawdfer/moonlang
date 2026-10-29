// Input validation for F-001 forms. Error messages are keys under `auth.errors`.
import { z } from "zod";
import { normalizePhone } from "@/server/auth/phone";

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const name = z.string().trim().min(2, "name").max(120, "name");
const email = z.string().trim().toLowerCase().pipe(z.email("email").max(254, "email"));
const phone = z
  .string()
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "phone" });
      return z.NEVER;
    }
    return normalized;
  });
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "tooLong")
    .transform((value) => (value === "" ? null : value));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "birthDate")
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00Z`)), "birthDate");

/** Staff creating an invite: name plus e-mail or phone (F-001, step 1). */
export const createInviteSchema = z
  .object({
    kind: z.enum(["student", "trial"]),
    name,
    email: z.union([z.literal("").transform(() => null), email]),
    phoneNumber: z.union([z.literal("").transform(() => null), phone]),
  })
  .refine((v) => v.email || v.phoneNumber, { message: "contactRequired", path: ["email"] });

/** Invite acceptance (F-001, step 4). Age (RN-019) is checked separately with the São Paulo date. */
export const acceptInviteSchema = z
  .object({
    name,
    email,
    phoneNumber: phone,
    birthDate: isoDate,
    password: z.string().min(PASSWORD_MIN, "passwordLength").max(PASSWORD_MAX, "passwordLength"),
    passwordConfirmation: z.string(),
    goal: optionalText(500),
    // RN-023: the account cannot be created without accepting the terms.
    acceptTerms: z.literal("on", "termsRequired"),
  })
  .refine((v) => v.password === v.passwordConfirmation, {
    message: "passwordMismatch",
    path: ["passwordConfirmation"],
  });

/** Root/admin creating a staff account (F-001). */
export const createStaffSchema = z.object({
  name,
  email,
  phoneNumber: z.union([z.literal("").transform(() => null), phone]),
  role: z.enum(["admin", "teacher"]),
});

/** First error message per field, for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    result[key] ??= issue.message;
  }
  return result;
}
