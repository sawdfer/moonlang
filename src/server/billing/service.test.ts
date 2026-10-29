import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/db";
import {
  auditLog,
  charge,
  classGroup,
  enrollment,
  lesson,
  notification,
  plan,
  setting,
  studentProfile,
  user,
} from "@/db/schema";
import { createTestDb } from "@/test/db";

const state = vi.hoisted(() => ({ db: undefined as unknown as Database }));
vi.mock("@/db", () => ({
  db: new Proxy({}, { get: (_t, p) => Reflect.get(state.db, p, state.db) }),
}));

const {
  BillingError,
  addExtraLessonCharge,
  markChargePaid,
  registerDropout,
  removeExtraLessonCharge,
  runDailyBilling,
  startPlan,
  undoChargePayment,
} = await import("./index");
const { listChargesForStaff, getOwnFinance } = await import("./queries");
const { updateBillingSettings } = await import("./settings");

/** Noon in São Paulo on a given day. */
const at = (day: string) => new Date(`${day}T12:00:00-03:00`);

const teacher = { id: "teacher", role: "teacher" as const };
const otherTeacher = { id: "other-teacher", role: "teacher" as const };
const admin = { id: "admin", role: "admin" as const };

async function seed() {
  const db = state.db;
  const now = new Date();
  const people = [
    { id: "teacher", role: "teacher" as const },
    { id: "other-teacher", role: "teacher" as const },
    { id: "admin", role: "admin" as const },
    { id: "ana", role: "trial" as const, phoneNumber: "+5511999990000" },
  ];
  await db.insert(user).values(
    people.map((p) => ({ ...p, name: p.id === "ana" ? "Ana Souza" : p.id, email: `${p.id}@x.test`, createdAt: now, updatedAt: now })),
  );
  await db.insert(studentProfile).values({ userId: "ana", birthDate: "1990-01-01" });
  const [p] = await db.insert(plan).values({ name: "1h", durationMinutes: 60, priceCents: 16900 }).returning();
  await db.insert(classGroup).values({
    id: "group",
    teacherId: "teacher",
    name: "Business B1",
    lessonType: "business",
    durationMinutes: 60,
    weekday: 2,
    startTime: "19:00",
    startsOn: "2026-01-01",
  });
  await db.insert(enrollment).values({
    id: "enr",
    classGroupId: "group",
    studentId: "ana",
    planId: p!.id,
    startedOn: "2026-11-21",
  });
  await db.insert(setting).values([
    { key: "dueDayOptions", value: [5, 10, 15, 20] },
    { key: "extraHourPriceCents", value: 5900 },
  ]);
}

const chargesOf = () => state.db.select().from(charge).where(eq(charge.enrollmentId, "enr")).orderBy(charge.dueDate);
const roleOf = async (id: string) => (await state.db.select().from(user).where(eq(user.id, id)))[0]!.role;
const enrollmentStatus = async () => (await state.db.select().from(enrollment).where(eq(enrollment.id, "enr")))[0]!.status;

beforeEach(async () => {
  state.db = await createTestDb();
  await seed();
});

describe("starting a plan (RN-025)", () => {
  it("RN-025: creates the R$ 85 first charge and saves the due day", async () => {
    const created = await startPlan(teacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21"));
    expect(created).toMatchObject({ kind: "first_prorated", amountCents: 8500, dueDate: "2026-11-21", periodEnd: "2026-12-04" });
    const [profile] = await state.db.select().from(studentProfile);
    expect(profile?.dueDay).toBe(5);
    const audits = await state.db.select().from(auditLog).where(eq(auditLog.action, "billing.plan_started"));
    expect(audits).toHaveLength(1);
  });

  it("RN-025: only accepts the configured due days", async () => {
    await expect(
      startPlan(teacher, { enrollmentId: "enr", dueDay: 7, startDate: "2026-11-21" }, at("2026-11-21")),
    ).rejects.toThrow(BillingError);
  });

  it("cannot start twice", async () => {
    await startPlan(teacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21"));
    await expect(
      startPlan(teacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21")),
    ).rejects.toThrow("already_started");
  });

  it("teachers only manage their own class groups", async () => {
    await expect(
      startPlan(otherTeacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21")),
    ).rejects.toThrow("forbidden");
  });
});

describe("payments (RN-014, RN-018, RN-025)", () => {
  it("RN-018/RN-025: paying the first charge turns the trial account into a student, and undo reverts it", async () => {
    const first = await startPlan(teacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21"));
    await markChargePaid(teacher, { chargeId: first.id, receivedCents: 8500, paidOn: "2026-11-22", note: "Pix" }, at("2026-11-22"));
    expect(await roleOf("ana")).toBe("student");

    await undoChargePayment(teacher, { chargeId: first.id }, at("2026-11-22"));
    expect(await roleOf("ana")).toBe("trial");
    const [undone] = await chargesOf();
    expect(undone).toMatchObject({ status: "overdue", paidAt: null, receivedCents: null });

    const actions = (await state.db.select().from(auditLog)).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["charge.paid", "charge.payment_undone", "user.role_changed"]));
  });

  it("RN-014: keeps the amount received when it differs", async () => {
    const first = await startPlan(teacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21"));
    const paid = await markChargePaid(teacher, { chargeId: first.id, receivedCents: 8000, paidOn: "2026-11-21" }, at("2026-11-21"));
    expect(paid).toMatchObject({ status: "paid", amountCents: 8500, receivedCents: 8000 });
  });

  it("another teacher cannot mark the charge as paid", async () => {
    const first = await startPlan(teacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21"));
    await expect(
      markChargePaid(otherTeacher, { chargeId: first.id, receivedCents: 8500, paidOn: "2026-11-21" }),
    ).rejects.toThrow("forbidden");
    expect(await listChargesForStaff(otherTeacher, "all")).toHaveLength(0);
    expect(await listChargesForStaff(admin, "all")).toHaveLength(1);
  });
});

describe("daily job (RN-013, RN-015, RN-025, RN-027)", () => {
  async function startedPlan() {
    const first = await startPlan(teacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21"));
    await markChargePaid(teacher, { chargeId: first.id, receivedCents: 8500, paidOn: "2026-11-21" }, at("2026-11-21"));
  }

  it("RN-025: generates the R$ 169 monthly charge for 05/12 with a 3-day notice, once", async () => {
    await startedPlan();
    await runDailyBilling(at("2026-12-01"));
    expect(await chargesOf()).toHaveLength(1);
    await runDailyBilling(at("2026-12-02"));
    await runDailyBilling(at("2026-12-02"));
    const charges = await chargesOf();
    expect(charges).toHaveLength(2);
    expect(charges[1]).toMatchObject({ kind: "monthly", amountCents: 16900, dueDate: "2026-12-05", status: "pending" });
    const notes = await state.db.select().from(notification).where(eq(notification.type, "billing.due_soon"));
    expect(notes).toHaveLength(1);
  });

  it("RN-015: marks overdue, blocks with 2 open monthly charges, stops charging, and unblocks with a prorated charge", async () => {
    await startedPlan();
    for (const day of ["2026-12-02", "2026-12-06", "2027-01-02", "2027-01-05", "2027-01-06"]) {
      await runDailyBilling(at(day));
    }
    expect(await enrollmentStatus()).toBe("blocked");
    const overdueNotes = await state.db.select().from(notification).where(eq(notification.type, "billing.overdue"));
    expect(overdueNotes).toHaveLength(2);

    // No new charge while blocked.
    await runDailyBilling(at("2027-02-03"));
    const open = (await chargesOf()).filter((c) => c.kind === "monthly");
    expect(open).toHaveLength(2);

    // Paying both on 10/02, mid-cycle, lifts the block and charges the rest of the cycle.
    await markChargePaid(teacher, { chargeId: open[0]!.id, receivedCents: 16900, paidOn: "2027-02-10" }, at("2027-02-10"));
    expect(await enrollmentStatus()).toBe("blocked");
    await markChargePaid(teacher, { chargeId: open[1]!.id, receivedCents: 16900, paidOn: "2027-02-10" }, at("2027-02-10"));
    expect(await enrollmentStatus()).toBe("active");
    const prorated = (await chargesOf()).at(-1);
    // Tuesdays 16/02, 23/02 and 02/03 until 04/03: 3 × R$ 42,25 → R$ 127.
    expect(prorated).toMatchObject({ periodStart: "2027-02-10", periodEnd: "2027-03-04", amountCents: 12700 });
  });

  it("RN-027: a drop-out stops future charges", async () => {
    await startedPlan();
    await registerDropout(teacher, { enrollmentId: "enr", reason: "Mudou de cidade" }, at("2026-11-25"));
    await runDailyBilling(at("2026-12-03"));
    expect(await chargesOf()).toHaveLength(1);
    expect(await enrollmentStatus()).toBe("dropped");
  });
});

describe("extra lessons (RN-026)", () => {
  it("RN-026: a 2h extra lesson adds R$ 118 to the next monthly due date, and is removed when cancelled in time", async () => {
    const first = await startPlan(teacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21"));
    await markChargePaid(teacher, { chargeId: first.id, receivedCents: 8500, paidOn: "2026-11-21" }, at("2026-11-21"));
    await state.db.insert(lesson).values({
      id: "extra",
      teacherId: "teacher",
      kind: "extra",
      startsAt: at("2026-11-26"),
      durationMinutes: 120,
      studentId: "ana",
    });
    const extra = await addExtraLessonCharge({ lessonId: "extra" }, at("2026-11-23"));
    expect(extra).toMatchObject({ kind: "extra_lesson", amountCents: 11800, dueDate: "2026-12-05" });

    await removeExtraLessonCharge("extra");
    const [after] = await state.db.select().from(charge).where(eq(charge.id, extra.id));
    expect(after?.status).toBe("cancelled");
  });
});

describe("student view and settings", () => {
  it("students only get their own charges", async () => {
    await startPlan(teacher, { enrollmentId: "enr", dueDay: 5, startDate: "2026-11-21" }, at("2026-11-21"));
    expect((await getOwnFinance("ana")).charges).toHaveLength(1);
    expect((await getOwnFinance("teacher")).charges).toHaveLength(0);
  });

  it("RN-016: only admins change billing settings, with an audit entry", async () => {
    const input = { pixKey: "luana@pix.test", extraHourPriceCents: 6000, dueDayOptions: [10, 5] };
    await expect(updateBillingSettings(teacher, input)).rejects.toThrow("forbidden");
    await updateBillingSettings(admin, input);
    const rows = await state.db.select().from(setting);
    expect(rows.find((r) => r.key === "dueDayOptions")?.value).toEqual([5, 10]);
    expect(rows.find((r) => r.key === "pixKey")?.value).toBe("luana@pix.test");
    expect(await state.db.$count(auditLog, eq(auditLog.action, "setting.updated"))).toBe(3);
  });
});
