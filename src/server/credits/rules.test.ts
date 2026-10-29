import { describe, expect, it } from "vitest";
import { lessonCreditExpiresAt } from "./rules";

describe("lessonCreditExpiresAt", () => {
  it("RN-011: a lesson credit is valid for 30 days from the cancellation", () => {
    const now = new Date("2026-11-10T22:00:00Z");
    expect(lessonCreditExpiresAt({ now, lessonStartsAt: new Date("2026-11-10T21:00:00Z") })).toEqual(
      new Date("2026-12-10T22:00:00Z"),
    );
  });

  it("RN-011: for a future lesson, the 30 days count from the lesson", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const lessonStartsAt = new Date("2027-01-12T22:00:00Z");
    expect(lessonCreditExpiresAt({ now, lessonStartsAt })).toEqual(new Date("2027-02-11T22:00:00Z"));
  });
});
