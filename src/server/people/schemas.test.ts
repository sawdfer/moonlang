import { describe, expect, it } from "vitest";
import { acceptInviteSchema, createInviteSchema, createStaffSchema, fieldErrors } from "./schemas";

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
