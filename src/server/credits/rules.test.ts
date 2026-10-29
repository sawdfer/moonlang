import { describe, expect, it } from "vitest";
import { capAtVacation, lessonCreditExpiresAt } from "./rules";

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

describe("capAtVacation", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const vacation = new Date("2026-12-20T03:00:00Z");

  it("V2, RN-011: a credit that would outlive the vacation start expires when it starts", () => {
    expect(capAtVacation(new Date("2027-01-05T03:00:00Z"), now, [vacation])).toEqual(vacation);
  });

  it("V2: a credit that expires before the vacation is not touched", () => {
    const expiresAt = new Date("2026-12-01T03:00:00Z");
    expect(capAtVacation(expiresAt, now, [vacation])).toEqual(expiresAt);
  });

  it("V2: the earliest upcoming vacation wins, past ones are ignored", () => {
    const later = new Date("2027-01-10T03:00:00Z");
    const past = new Date("2026-10-01T03:00:00Z");
    expect(capAtVacation(new Date("2027-02-01T03:00:00Z"), now, [later, past, vacation])).toEqual(vacation);
  });

  it("V2: lesson credits granted before a vacation expire at its start", () => {
    expect(
      lessonCreditExpiresAt({ now, lessonStartsAt: new Date("2026-12-08T22:00:00Z"), vacationStarts: [vacation] }),
    ).toEqual(vacation);
  });
});
