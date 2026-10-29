import { describe, expect, it } from "vitest";
import { accessGate, canCreateStaff, canDisableTwoFactor, creatableStaffRoles } from "./access";
import { homePathFor, STUDENT_LESSONS_PATH } from "./roles";

describe("accessGate", () => {
  it("F-001: staff without two-factor must enroll first", () => {
    for (const role of ["root", "admin", "teacher"] as const) {
      expect(accessGate({ role, twoFactorEnabled: false, needsConsent: false })).toBe("two-factor");
      expect(accessGate({ role, twoFactorEnabled: true, needsConsent: false })).toBeNull();
    }
  });

  it("F-001: two-factor is optional for students", () => {
    expect(accessGate({ role: "student", twoFactorEnabled: false, needsConsent: false })).toBeNull();
  });

  it("RN-023: a pending consent sends the user to accept the terms", () => {
    expect(accessGate({ role: "student", twoFactorEnabled: false, needsConsent: true })).toBe("consent");
    expect(accessGate({ role: "trial", twoFactorEnabled: true, needsConsent: true })).toBe("consent");
  });
});

describe("staff accounts", () => {
  it("F-001: only root creates admins", () => {
    expect(canCreateStaff("root", "admin")).toBe(true);
    expect(canCreateStaff("admin", "admin")).toBe(false);
    expect(canCreateStaff("teacher", "admin")).toBe(false);
  });

  it("F-001: root and admins create teachers", () => {
    expect(canCreateStaff("root", "teacher")).toBe(true);
    expect(canCreateStaff("admin", "teacher")).toBe(true);
    expect(canCreateStaff("teacher", "teacher")).toBe(false);
    expect(canCreateStaff("student", "teacher")).toBe(false);
  });

  it("F-001: there is a single root account, nobody creates another", () => {
    expect(creatableStaffRoles("root")).not.toContain("root");
    expect(creatableStaffRoles("admin")).not.toContain("root");
  });

  it("F-001: staff cannot turn two-factor off, students can", () => {
    expect(canDisableTwoFactor("teacher")).toBe(false);
    expect(canDisableTwoFactor("admin")).toBe(false);
    expect(canDisableTwoFactor("root")).toBe(false);
    expect(canDisableTwoFactor("student")).toBe(true);
  });
});

describe("homePathFor", () => {
  it("RN-018: trial users land on the online lessons page", () => {
    expect(homePathFor("trial")).toBe(STUDENT_LESSONS_PATH);
    expect(homePathFor("student")).toBe("/student");
    expect(homePathFor("teacher")).toBe("/teacher");
  });
});
