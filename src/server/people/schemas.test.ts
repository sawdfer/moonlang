import { describe, expect, it } from "vitest";
import {
  acceptInviteSchema,
  contactAttemptSchema,
  createInviteSchema,
  createStaffSchema,
  fieldErrors,
  ownProfileSchema,
  registerStudentSchema,
  removeStudentSchema,
} from "./schemas";

const valid = {
  name: "Ana Souza",
  email: "Ana@Example.com ",
  phoneNumber: "(11) 91234-5678",
  birthDate: "1995-04-12",
  password: "a long enough passphrase",
  passwordConfirmation: "a long enough passphrase",
  goal: "",
  acceptTerms: "on",
};

function errorsOf(result: { success: boolean; error?: unknown }) {
  return result.success ? {} : fieldErrors(result.error as never);
}

describe("acceptInviteSchema", () => {
  it("normalizes e-mail, phone and empty goal", () => {
    const parsed = acceptInviteSchema.parse(valid);
    expect(parsed.email).toBe("ana@example.com");
    expect(parsed.phoneNumber).toBe("+5511912345678");
    expect(parsed.goal).toBeNull();
  });

  it("RN-023: the account cannot be created without accepting the term", () => {
    expect(errorsOf(acceptInviteSchema.safeParse({ ...valid, acceptTerms: undefined }))).toMatchObject({
      acceptTerms: "termsRequired",
    });
  });

  it("RN-019: birth date is mandatory", () => {
    expect(errorsOf(acceptInviteSchema.safeParse({ ...valid, birthDate: "" }))).toMatchObject({
      birthDate: "birthDate",
    });
  });

  it("F-001: passwords have at least 12 characters and must match", () => {
    expect(
      errorsOf(acceptInviteSchema.safeParse({ ...valid, password: "short", passwordConfirmation: "short" })),
    ).toMatchObject({ password: "passwordLength" });
    expect(
      errorsOf(acceptInviteSchema.safeParse({ ...valid, passwordConfirmation: "something else!!" })),
    ).toMatchObject({ passwordConfirmation: "passwordMismatch" });
  });
});

describe("createInviteSchema", () => {
  it("F-001: needs the e-mail or the phone number", () => {
    const base = { kind: "student", name: "Ana Souza", email: "", phoneNumber: "" };
    expect(errorsOf(createInviteSchema.safeParse(base))).toMatchObject({ email: "contactRequired" });
    expect(createInviteSchema.parse({ ...base, phoneNumber: "11912345678" })).toMatchObject({
      email: null,
      phoneNumber: "+5511912345678",
    });
  });

  it("F-001: invites are only for students or trial students", () => {
    const base = { name: "Ana Souza", email: "ana@example.com", phoneNumber: "" };
    expect(createInviteSchema.safeParse({ ...base, kind: "trial" }).success).toBe(true);
    expect(createInviteSchema.safeParse({ ...base, kind: "admin" }).success).toBe(false);
  });
});

describe("createStaffSchema", () => {
  it("F-001: root can never be created from the form", () => {
    const base = { name: "Luana", email: "luana@example.com", phoneNumber: "" };
    expect(createStaffSchema.safeParse({ ...base, role: "teacher" }).success).toBe(true);
    expect(createStaffSchema.safeParse({ ...base, role: "root" }).success).toBe(false);
  });
});

describe("F-002 schemas", () => {
  const person = {
    name: "Bruno Lima",
    email: "bruno@example.com",
    phoneNumber: "11 98765-4321",
    birthDate: "1990-01-15",
    goal: "",
    cefrLevel: "B1",
  };

  it("F-002: a current student needs class group, plan and due day", () => {
    const base = { ...person, kind: "existing", classGroupId: "", planId: "", dueDay: "" };
    expect(errorsOf(registerStudentSchema.safeParse(base))).toMatchObject({
      classGroupId: "required",
      planId: "required",
      dueDay: "required",
    });
    expect(
      registerStudentSchema.parse({ ...base, classGroupId: "g1", planId: "p1", dueDay: "10" }),
    ).toMatchObject({ kind: "existing", dueDay: 10, cefrLevel: "B1" });
  });

  it("F-002: new students and trial people need no placement", () => {
    const parsed = registerStudentSchema.parse({ ...person, kind: "trial", classGroupId: "", planId: "", dueDay: "" });
    expect(parsed).toMatchObject({ classGroupId: null, planId: null, dueDay: null, goal: null });
  });

  it("RN-019: birth date is mandatory in manual registration", () => {
    const parsed = registerStudentSchema.safeParse({ ...person, birthDate: "", kind: "student", classGroupId: "", planId: "", dueDay: "" });
    expect(errorsOf(parsed)).toMatchObject({ birthDate: "birthDate" });
  });

  it("RN-021, RN-023: removing an account needs a reason and an explicit confirmation", () => {
    expect(errorsOf(removeStudentSchema.safeParse({ reason: "", confirm: undefined }))).toMatchObject({
      reason: "reasonRequired",
      confirm: "confirmRequired",
    });
    expect(removeStudentSchema.safeParse({ reason: "Pediu exclusão", confirm: "on" }).success).toBe(true);
  });

  it("F-002: contact attempts use the known channels", () => {
    expect(contactAttemptSchema.safeParse({ channel: "whatsapp", outcome: "", note: "" }).success).toBe(true);
    expect(contactAttemptSchema.safeParse({ channel: "pigeon", outcome: "", note: "" }).success).toBe(false);
  });

  it("F-002: a student's own profile never accepts private notes or a role", () => {
    const parsed = ownProfileSchema.parse({ ...person, privateNotes: "x", role: "admin" });
    expect(parsed).not.toHaveProperty("privateNotes");
    expect(parsed).not.toHaveProperty("role");
  });
});
