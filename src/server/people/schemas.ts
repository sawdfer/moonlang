// Input validation for F-001 and F-002 forms. Error messages are keys under `auth.errors`.
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

const cefr = z.union([
  z.literal("").transform(() => null),
  z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
]);
const optionalId = z.string().trim().transform((value) => (value === "" ? null : value));

/**
 * Manual registration by staff (F-002). New people get a trial or student
 * account; the current students ("existing") are enrolled right away, without
 * the trial or the prorated first charge. Age (RN-019) is checked separately.
 */
export const registerStudentSchema = z
  .object({
    kind: z.enum(["trial", "student", "existing"]),
    name,
    email,
    phoneNumber: phone,
    birthDate: isoDate,
    goal: optionalText(500),
    cefrLevel: cefr,
    classGroupId: optionalId,
    planId: optionalId,
    dueDay: z.union([z.literal("").transform(() => null), z.coerce.number().int().min(1).max(28)]),
  })
  .superRefine((v, ctx) => {
    if (v.kind !== "existing") return;
    for (const key of ["classGroupId", "planId", "dueDay"] as const) {
      if (v[key] === null) ctx.addIssue({ code: "custom", message: "required", path: [key] });
    }
  });

/** Staff editing a student (F-002): data, level and private notes. */
export const staffUpdateStudentSchema = z.object({
  name,
  email,
  phoneNumber: phone,
  birthDate: isoDate,
  goal: optionalText(500),
  cefrLevel: cefr,
  privateNotes: optionalText(5000),
});

/** Re-engagement attempt with an inactive student (F-002). */
export const contactAttemptSchema = z.object({
  channel: z.enum(["whatsapp", "email", "phone_call"]),
  outcome: optionalText(200),
  note: optionalText(1000),
});

/** The student's own data (F-002, RN-023). Changing the e-mail asks for the password. */
export const ownProfileSchema = z.object({
  name,
  email,
  phoneNumber: phone,
  goal: optionalText(500),
  currentPassword: z.string().max(PASSWORD_MAX).optional().default(""),
});

export const dueDaySchema = z.object({ dueDay: z.coerce.number().int().min(1).max(28) });

/** RN-021, RN-023: removal needs an explicit confirmation and a reason for the audit log. */
export const removeStudentSchema = z.object({
  reason: z.string().trim().min(3, "reasonRequired").max(500, "tooLong"),
  confirm: z.literal("on", "confirmRequired"),
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
