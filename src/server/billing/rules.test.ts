import { describe, expect, it } from "vitest";
import {
  type ChargeFacts,
  blockingDecision,
  blockWarning,
  chargeAfterUnblock,
  countWeeklyLessons,
  coveredUntil,
  cycleEnd,
  dueSoonCharges,
  effectiveStatus,
  extraLessonDueDate,
  extraLessonPriceCents,
  nextDueDate,
  nextMonthlyCharge,
  planFirstCharge,
  planStarted,
  proratedAmountCents,
} from "./rules";

const TUESDAY = 2;
const THURSDAY = 4;
const SATURDAY = 6;
const PLAN_1H = 16900;
const PLAN_2H = 24900;
const tuesdayGroup = { weekday: TUESDAY, startsOn: "2026-01-01" };

function monthly(dueDate: string, status: ChargeFacts["status"], periodEnd: string): ChargeFacts {
  return { kind: "monthly", status, dueDate, periodStart: dueDate, periodEnd };
}

describe("due dates and cycles", () => {
  it("RN-025: the first due date is the next chosen day on or after the start", () => {
    expect(nextDueDate("2026-11-21", 5)).toBe("2026-12-05");
    expect(nextDueDate("2026-11-05", 5)).toBe("2026-11-05");
    expect(nextDueDate("2026-12-21", 5)).toBe("2027-01-05");
  });

  it("RN-025: a cycle runs from one due date to the day before the next", () => {
    expect(cycleEnd("2026-12-05", 5)).toBe("2027-01-04");
    expect(cycleEnd("2026-12-10", 10)).toBe("2027-01-09");
  });

  it("falls on the last day of short months", () => {
    expect(nextDueDate("2027-02-01", 31)).toBe("2027-02-28");
    expect(cycleEnd("2027-01-31", 31)).toBe("2027-02-27");
  });

  it("counts weekly lessons with both ends included, inside the class group dates", () => {
    expect(countWeeklyLessons(tuesdayGroup, "2026-11-21", "2026-12-04")).toBe(2);
    expect(countWeeklyLessons(tuesdayGroup, "2026-11-24", "2026-12-01")).toBe(2);
    expect(countWeeklyLessons(tuesdayGroup, "2026-11-25", "2026-11-30")).toBe(0);
    expect(countWeeklyLessons({ ...tuesdayGroup, startsOn: "2026-12-01" }, "2026-11-21", "2026-12-04")).toBe(1);
    expect(countWeeklyLessons({ ...tuesdayGroup, endsOn: "2026-11-30" }, "2026-11-21", "2026-12-04")).toBe(1);
  });
});

describe("first prorated charge (RN-025)", () => {
  it("RN-025: rounds R$ 84,50 to R$ 85", () => {
    expect(proratedAmountCents(2, PLAN_1H)).toBe(8500);
  });

  it("RN-025: spec example — 1h plan, Tuesday group, start Saturday 21/11, due day 5 → R$ 85", () => {
    const draft = planFirstCharge({
      startDate: "2026-11-21",
      dueDay: 5,
      group: tuesdayGroup,
      monthlyPriceCents: PLAN_1H,
      today: "2026-11-21",
    });
    expect(draft).toEqual({
      kind: "first_prorated",
      periodStart: "2026-11-21",
      periodEnd: "2026-12-04",
      amountCents: 8500,
      dueDate: "2026-11-21",
      lessons: 2,
    });

    // Once paid, the next charge is the full R$ 169, due on 05/12.
    const next = nextMonthlyCharge({
      status: "active",
      charges: [{ ...draft, status: "paid" }],
      dueDay: 5,
      monthlyPriceCents: PLAN_1H,
      group: tuesdayGroup,
      today: "2026-11-28",
    });
    expect(next).toEqual({
      kind: "monthly",
      periodStart: "2026-12-05",
      periodEnd: "2027-01-04",
      amountCents: PLAN_1H,
      dueDate: "2026-12-05",
    });
  });

  it("RN-025: is due right away", () => {
    const draft = planFirstCharge({
      startDate: "2026-11-21",
      dueDay: 5,
      group: tuesdayGroup,
      monthlyPriceCents: PLAN_1H,
      today: "2026-11-18",
    });
    expect(draft.dueDate).toBe("2026-11-18");
  });

  it("RN-025/RN-013: never goes above the monthly price, even with 5 lessons", () => {
    const draft = planFirstCharge({
      startDate: "2026-11-21",
      dueDay: 20,
      group: { weekday: SATURDAY, startsOn: "2026-01-01" },
      monthlyPriceCents: PLAN_1H,
      today: "2026-11-21",
    });
    expect(draft.lessons).toBe(5);
    expect(draft.amountCents).toBe(PLAN_1H);
  });

  it("RN-025: uses a quarter of the 2h plan per lesson", () => {
    expect(proratedAmountCents(1, PLAN_2H)).toBe(6200); // R$ 62,25
    expect(proratedAmountCents(3, PLAN_2H)).toBe(18700); // R$ 186,75
  });

  it("RN-025: with no lesson in the period, charges the full first cycle", () => {
    const draft = planFirstCharge({
      startDate: "2026-11-04",
      dueDay: 5,
      group: tuesdayGroup,
      monthlyPriceCents: PLAN_1H,
      today: "2026-11-04",
    });
    expect(draft).toMatchObject({
      lessons: 0,
      amountCents: PLAN_1H,
      periodStart: "2026-11-05",
      periodEnd: "2026-12-04",
      dueDate: "2026-11-04",
    });
  });

  it("RN-025: starting on the due day charges the full first cycle", () => {
    const draft = planFirstCharge({
      startDate: "2026-11-05",
      dueDay: 5,
      group: tuesdayGroup,
      monthlyPriceCents: PLAN_1H,
      today: "2026-11-05",
    });
    expect(draft).toMatchObject({ amountCents: PLAN_1H, periodStart: "2026-11-05", periodEnd: "2026-12-04" });
  });
});

describe("monthly charges (RN-013, RN-025)", () => {
  const paidFirst: ChargeFacts = {
    kind: "first_prorated",
    status: "paid",
    dueDate: "2026-11-21",
    periodStart: "2026-11-21",
    periodEnd: "2026-12-04",
  };
  const base = { status: "active" as const, dueDay: 5, monthlyPriceCents: PLAN_1H, group: tuesdayGroup };

  it("V6: is generated 7 days before the due date, not earlier", () => {
    expect(nextMonthlyCharge({ ...base, charges: [paidFirst], today: "2026-11-27" })).toBeNull();
    expect(nextMonthlyCharge({ ...base, charges: [paidFirst], today: "2026-11-28" })?.dueDate).toBe("2026-12-05");
  });

  it("V6: the \"due soon\" notice still waits until 3 days before", () => {
    const charges = [paidFirst, monthly("2026-12-05", "pending", "2027-01-04")];
    expect(dueSoonCharges(charges, "2026-11-28")).toHaveLength(0);
    expect(dueSoonCharges(charges, "2026-12-01")).toHaveLength(0);
    expect(dueSoonCharges(charges, "2026-12-02")).toHaveLength(1);
    expect(dueSoonCharges(charges, "2026-12-04")).toHaveLength(1);
    expect(dueSoonCharges(charges, "2026-12-05")).toHaveLength(0);
    expect(dueSoonCharges(charges, "2026-12-06")).toHaveLength(0);
  });

  it("RN-025: continues from the last covered cycle", () => {
    const charges = [paidFirst, monthly("2026-12-05", "paid", "2027-01-04")];
    expect(nextMonthlyCharge({ ...base, charges, today: "2027-01-02" })).toMatchObject({
      periodStart: "2027-01-05",
      periodEnd: "2027-02-04",
      dueDate: "2027-01-05",
    });
    // Already generated: nothing new until the next lead window.
    expect(nextMonthlyCharge({ ...base, charges, today: "2026-12-28" })).toBeNull();
  });

  it("RN-013: a cycle with a 5th weekly lesson still costs the monthly price", () => {
    const saturdayGroup = { weekday: SATURDAY, startsOn: "2026-01-01" };
    expect(countWeeklyLessons(saturdayGroup, "2026-12-05", "2027-01-04")).toBe(5);
    const draft = nextMonthlyCharge({ ...base, group: saturdayGroup, charges: [paidFirst], today: "2026-12-05" });
    expect(draft?.amountCents).toBe(PLAN_1H);
  });

  it("RN-018/RN-025: nothing is generated while the first charge is unpaid", () => {
    const unpaid = { ...paidFirst, status: "pending" as const };
    expect(planStarted([unpaid])).toBe(false);
    expect(nextMonthlyCharge({ ...base, charges: [unpaid], today: "2026-12-05" })).toBeNull();
  });

  it("does not start billing an enrollment that has no charge yet", () => {
    expect(nextMonthlyCharge({ ...base, charges: [], today: "2026-12-05" })).toBeNull();
  });

  it("stops after the class group ends", () => {
    const group = { ...tuesdayGroup, endsOn: "2026-12-01" };
    expect(nextMonthlyCharge({ ...base, group, charges: [paidFirst], today: "2026-12-05" })).toBeNull();
  });
});

describe("overdue and blocking (RN-015)", () => {
  it("RN-015: an unpaid charge is overdue from the day after its due date", () => {
    expect(effectiveStatus({ status: "pending", dueDate: "2026-11-10" }, "2026-11-10")).toBe("pending");
    expect(effectiveStatus({ status: "pending", dueDate: "2026-11-10" }, "2026-11-11")).toBe("overdue");
    expect(effectiveStatus({ status: "paid", dueDate: "2026-11-10" }, "2026-12-11")).toBe("paid");
  });

  it("RN-015: spec example — charges of 10/11 and 10/12 open block the student on 11/12", () => {
    const charges = [monthly("2026-11-10", "pending", "2026-12-09"), monthly("2026-12-10", "pending", "2027-01-09")];
    expect(blockingDecision("active", charges, "2026-12-10")).toBeNull();
    expect(blockingDecision("active", charges, "2026-12-11")).toBe("block");
  });

  it("RN-015: no new charges while blocked", () => {
    const charges = [monthly("2026-11-10", "overdue", "2026-12-09"), monthly("2026-12-10", "overdue", "2027-01-09")];
    const draft = nextMonthlyCharge({
      status: "blocked",
      charges,
      dueDay: 10,
      monthlyPriceCents: PLAN_1H,
      group: tuesdayGroup,
      today: "2027-01-10",
    });
    expect(draft).toBeNull();
  });

  it("RN-015: the first prorated charge does not count for blocking (F-007)", () => {
    const charges: ChargeFacts[] = [
      { kind: "first_prorated", status: "pending", dueDate: "2026-11-01", periodStart: "2026-11-01", periodEnd: "2026-11-09" },
      monthly("2026-11-10", "pending", "2026-12-09"),
    ];
    expect(blockingDecision("active", charges, "2026-12-20")).toBeNull();
  });

  it("RN-015: the block stays until every overdue charge is paid", () => {
    const oneLeft = [monthly("2026-11-10", "paid", "2026-12-09"), monthly("2026-12-10", "overdue", "2027-01-09")];
    expect(blockingDecision("blocked", oneLeft, "2027-01-15")).toBeNull();
    const allPaid = [monthly("2026-11-10", "paid", "2026-12-09"), monthly("2026-12-10", "paid", "2027-01-09")];
    expect(blockingDecision("blocked", allPaid, "2027-01-15")).toBe("unblock");
  });

  it("RN-015: spec example — unblocked on 15/01 with due day 10 pays the lessons of 15/01 to 09/02", () => {
    const charges = [monthly("2026-11-10", "paid", "2026-12-09"), monthly("2026-12-10", "paid", "2027-01-09")];
    const draft = chargeAfterUnblock({
      charges,
      dueDay: 10,
      group: { weekday: THURSDAY, startsOn: "2026-01-01" },
      monthlyPriceCents: PLAN_1H,
      today: "2027-01-15",
    });
    // Thursdays 21/01, 28/01 and 04/02: 3 × R$ 42,25 = R$ 126,75 → R$ 127.
    expect(draft).toMatchObject({
      kind: "monthly",
      periodStart: "2027-01-15",
      periodEnd: "2027-02-09",
      lessons: 3,
      amountCents: 12700,
      dueDate: "2027-01-15",
    });

    // Then the cycles go back to normal: the next full charge is due on 10/02.
    const next = nextMonthlyCharge({
      status: "active",
      charges: [...charges, { ...draft!, status: "pending" }],
      dueDay: 10,
      monthlyPriceCents: PLAN_1H,
      group: { weekday: THURSDAY, startsOn: "2026-01-01" },
      today: "2027-02-07",
    });
    expect(next).toMatchObject({ dueDate: "2027-02-10", amountCents: PLAN_1H });
  });

  it("RN-015: no prorated charge when the current cycle was already charged", () => {
    const charges = [monthly("2026-11-10", "paid", "2026-12-09"), monthly("2026-12-10", "paid", "2027-01-09")];
    expect(
      chargeAfterUnblock({ charges, dueDay: 10, group: tuesdayGroup, monthlyPriceCents: PLAN_1H, today: "2026-12-12" }),
    ).toBeNull();
  });

  it("RN-015: with no lesson left in the cycle, the next full cycle is due on its first day", () => {
    const charges = [monthly("2026-11-10", "paid", "2026-12-09")];
    // Thursday 07/01; due day 10; Tuesday group has no lesson on 07–09/01.
    const draft = chargeAfterUnblock({
      charges,
      dueDay: 10,
      group: tuesdayGroup,
      monthlyPriceCents: PLAN_1H,
      today: "2027-01-07",
    });
    expect(draft).toMatchObject({ periodStart: "2027-01-10", amountCents: PLAN_1H, dueDate: "2027-01-10" });
  });
});

describe("manual unblock and admin changes (RN-015, V7)", () => {
  const twoOverdue = () => [monthly("2026-11-10", "overdue", "2026-12-09"), monthly("2026-12-10", "overdue", "2027-01-09")];

  it("V7/RN-015: waived overdue charges no longer block, so the student stays unblocked", () => {
    const waived = twoOverdue().map((c) => ({ ...c, blockWaivedAt: new Date() }));
    expect(blockingDecision("blocked", waived, "2026-12-20")).toBe("unblock");
    expect(blockingDecision("active", waived, "2026-12-20")).toBeNull();
  });

  it("V7/RN-015: new overdue charges after a manual unblock count again", () => {
    const charges = [
      ...twoOverdue().map((c) => ({ ...c, blockWaivedAt: new Date() })),
      monthly("2027-01-10", "pending", "2027-02-09"),
      monthly("2027-02-10", "pending", "2027-03-09"),
    ];
    expect(blockingDecision("active", charges, "2027-01-11")).toBeNull();
    expect(blockingDecision("active", charges, "2027-02-11")).toBe("block");
  });

  it("V7: a cancelled monthly charge waives its cycle instead of being generated again", () => {
    const charges = [monthly("2026-11-10", "paid", "2026-12-09"), monthly("2026-12-10", "cancelled", "2027-01-09")];
    expect(coveredUntil(charges)).toBe("2027-01-09");
    const next = nextMonthlyCharge({
      status: "active",
      charges,
      dueDay: 10,
      monthlyPriceCents: PLAN_1H,
      group: tuesdayGroup,
      today: "2027-01-03",
    });
    expect(next?.dueDate).toBe("2027-01-10");
  });

  it("V7: a cancelled first charge does not start the plan", () => {
    const charges: ChargeFacts[] = [
      { kind: "first_prorated", status: "cancelled", dueDate: "2026-11-21", periodStart: "2026-11-21", periodEnd: "2026-12-04" },
    ];
    expect(coveredUntil(charges)).toBeNull();
  });

  it("V7/RN-015: cancelling one of two overdue charges lifts the block", () => {
    const charges = twoOverdue();
    charges[0]!.status = "cancelled";
    expect(blockingDecision("blocked", charges, "2026-12-20")).toBeNull(); // one overdue left
    charges[1]!.status = "cancelled";
    expect(blockingDecision("blocked", charges, "2026-12-20")).toBe("unblock");
  });
});

describe("warning before the block (RN-015)", () => {
  it("RN-015: with 1 overdue monthly charge, warns with the next due date as the deadline", () => {
    const charges = [monthly("2026-11-10", "overdue", "2026-12-09"), monthly("2026-12-10", "pending", "2027-01-09")];
    const warning = blockWarning({ status: "active", charges, dueDay: 10, today: "2026-12-05" });
    expect(warning?.charge.dueDate).toBe("2026-11-10");
    expect(warning?.deadline).toBe("2026-12-10");
  });

  it("RN-015: before the next charge exists, the deadline is the next cycle start", () => {
    const charges = [monthly("2026-11-10", "overdue", "2026-12-09")];
    expect(blockWarning({ status: "active", charges, dueDay: 10, today: "2026-11-20" })?.deadline).toBe("2026-12-10");
  });

  it("RN-015: no warning without overdue charges, once blocked, or for waived charges (V7)", () => {
    const one = [monthly("2026-11-10", "overdue", "2026-12-09")];
    expect(blockWarning({ status: "active", charges: [monthly("2026-11-10", "pending", "2026-12-09")], dueDay: 10, today: "2026-11-05" })).toBeNull();
    expect(blockWarning({ status: "blocked", charges: one, dueDay: 10, today: "2026-11-20" })).toBeNull();
    expect(
      blockWarning({ status: "active", charges: [{ ...one[0]!, blockWaivedAt: new Date() }], dueDay: 10, today: "2026-11-20" }),
    ).toBeNull();
  });
});

describe("drop-out (RN-027)", () => {
  it("RN-027: no future charges after a drop-out", () => {
    const charges = [monthly("2026-11-10", "paid", "2026-12-09")];
    const draft = nextMonthlyCharge({
      status: "dropped",
      charges,
      dueDay: 10,
      monthlyPriceCents: PLAN_1H,
      group: tuesdayGroup,
      today: "2026-12-10",
    });
    expect(draft).toBeNull();
  });

  it("RN-027: a dropped enrollment is never blocked or unblocked", () => {
    const charges = [monthly("2026-11-10", "pending", "2026-12-09"), monthly("2026-12-10", "pending", "2027-01-09")];
    expect(blockingDecision("dropped", charges, "2027-01-20")).toBeNull();
  });
});

describe("extra lessons (RN-026)", () => {
  it("RN-026: costs hours × R$ 59", () => {
    expect(extraLessonPriceCents(60, 5900)).toBe(5900);
    expect(extraLessonPriceCents(120, 5900)).toBe(11800);
  });

  it("RN-026: uses the configured hourly price", () => {
    expect(extraLessonPriceCents(120, 6500)).toBe(13000);
  });

  it("RN-026: spec example — requested on 20/11 with due day 10, it joins the charge due on 10/12", () => {
    expect(extraLessonDueDate({ today: "2026-11-20", dueDay: 10, paidMonthlyDueDates: [] })).toBe("2026-12-10");
  });

  it("RN-026: skips a monthly charge that is already paid", () => {
    expect(
      extraLessonDueDate({ today: "2026-12-08", dueDay: 10, paidMonthlyDueDates: ["2026-12-10"] }),
    ).toBe("2027-01-10");
  });
});
