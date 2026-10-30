import { describe, expect, it } from "vitest";
import { staffSeesStudent } from "./visibility";

const teacher = { id: "luana", role: "teacher" as const };

describe("staffSeesStudent", () => {
  it("02-perfis: admins and root see every student", () => {
    expect(staffSeesStudent({ id: "a", role: "admin" }, ["someone-else"])).toBe(true);
    expect(staffSeesStudent({ id: "r", role: "root" }, [])).toBe(true);
  });

  it("02-perfis: a teacher sees students of her own class groups only", () => {
    expect(staffSeesStudent(teacher, ["luana"])).toBe(true);
    expect(staffSeesStudent(teacher, ["other-teacher"])).toBe(false);
    expect(staffSeesStudent(teacher, ["other-teacher", "luana"])).toBe(true);
  });

  it("F-002: students not yet in a group are visible, so the teacher can place them", () => {
    expect(staffSeesStudent(teacher, [])).toBe(true);
  });

  it("F-001: students never see other students' profiles", () => {
    expect(staffSeesStudent({ id: "s", role: "student" }, [])).toBe(false);
    expect(staffSeesStudent({ id: "t", role: "trial" }, [])).toBe(false);
  });
});
