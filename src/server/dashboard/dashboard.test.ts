import { beforeEach, describe, expect, it } from "vitest";
import enMessages from "../../../messages/en/experience.json";
import ptMessages from "../../../messages/pt-BR/experience.json";
import type { Database } from "@/db/client";
import { charge, classGroup, enrollment, invite, lesson, plan, studentProfile, user, whatsappMessage } from "@/db/schema";
import { CEFR_LEVELS, cefrBand, FUN_KEYS, funMessageId } from "@/i18n/fun";
import { createTestDb } from "@/test/db";
import { cefrLevelOf, loadDashboard } from "./queries";
import { appDayRange, chargeState, summarizeCharges } from "./rules";

const sp = (local: string) => new Date(`${local}-03:00`);
const NOW = sp("2026-10-28T09:00:00");

describe("dashboard rules", () => {
  it("F-009/RN-001: 'today' is the São Paulo calendar day", () => {
    const { from, to } = appDayRange(new Date("2026-10-29T01:30:00Z")); // 22:30 on the 28th in São Paulo
    expect(from.toISOString()).toBe("2026-10-28T03:00:00.000Z");
    expect(to.toISOString()).toBe("2026-10-29T03:00:00.000Z");
  });

  it("F-009: pending charges past their due date count as overdue", () => {
    expect(chargeState({ status: "pending", dueDate: "2026-10-27" }, NOW)).toBe("overdue");
    expect(chargeState({ status: "pending", dueDate: "2026-10-28" }, NOW)).toBe("pending");
    expect(
      summarizeCharges(
        [
          { status: "pending", dueDate: "2026-10-20", amountCents: 16900 },
          { status: "pending", dueDate: "2026-11-05", amountCents: 24900 },
        ],
        NOW,
      ),
    ).toEqual({ open: 2, overdue: 1, totalCents: 41800 });
  });
});

describe("fun messages by CEFR level", () => {
  it("F-010: A1–A2 basic, B1–B2 intermediate, C1–C2 advanced, no level basic", () => {
    expect(CEFR_LEVELS.map(cefrBand)).toEqual([
      "basic",
      "basic",
      "intermediate",
      "intermediate",
      "advanced",
      "advanced",
    ]);
    expect(cefrBand(null)).toBe("basic");
  });

  it("F-010: every key has the three bands in both languages", () => {
    for (const catalog of [ptMessages.fun, enMessages.fun]) {
      for (const key of FUN_KEYS) {
        for (const band of ["basic", "intermediate", "advanced"] as const) {
          const [k, b] = funMessageId(key, band).split(".") as [keyof typeof catalog, typeof band];
          expect(catalog[k][b], `${key}.${band}`).toBeTruthy();
        }
      }
    }
  });

  it("F-010: both languages have the same dashboard and switcher texts", () => {
    const keys = (o: object): string[] =>
      Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? keys(v).map((x) => `${k}.${x}`) : [k]));
    expect(keys(enMessages).sort()).toEqual(keys(ptMessages).sort());
  });
});

describe("loadDashboard", () => {
  let db: Database;

  async function addUser(id: string, role: "root" | "admin" | "teacher" | "student" | "trial", name = id) {
    await db.insert(user).values({ id, name, email: `${id}@example.com`, role, createdAt: NOW, updatedAt: NOW });
  }

  beforeEach(async () => {
    db = await createTestDb();
    await addUser("luana", "teacher", "Luana");
    await addUser("other", "teacher", "Outra");
    await addUser("admin", "admin");
    await addUser("ana", "student", "Ana");
    await addUser("bia", "trial", "Bia");
    await addUser("old", "student", "Antigo");
    const [p] = await db.insert(plan).values({ name: "1h", durationMinutes: 60, priceCents: 16900 }).returning();
    await db.insert(classGroup).values([
      { id: "g1", teacherId: "luana", name: "Turma de quarta", lessonType: "conversation", durationMinutes: 60, weekday: 3, startTime: "19:00", meetingUrl: "https://meet.google.com/aaa-bbbb-ccc", startsOn: "2026-01-01" },
      { id: "g2", teacherId: "other", name: "Turma da outra", lessonType: "grammar", durationMinutes: 60, weekday: 3, startTime: "20:00", startsOn: "2026-01-01" },
    ]);
    const [e1] = await db
      .insert(enrollment)
      .values({ classGroupId: "g1", studentId: "ana", planId: p!.id, startedOn: "2026-01-01" })
      .returning();
    await db.insert(lesson).values([
      { id: "today", classGroupId: "g1", teacherId: "luana", kind: "weekly", startsAt: sp("2026-10-28T19:00:00"), durationMinutes: 60 },
      { id: "cancelled", classGroupId: "g1", teacherId: "luana", kind: "extra", startsAt: sp("2026-10-28T10:00:00"), durationMinutes: 60, status: "cancelled_by_teacher" },
      { id: "tomorrow", classGroupId: "g1", teacherId: "luana", kind: "weekly", startsAt: sp("2026-10-29T19:00:00"), durationMinutes: 60 },
      { id: "others", classGroupId: "g2", teacherId: "other", kind: "weekly", startsAt: sp("2026-10-28T20:00:00"), durationMinutes: 60 },
      { id: "request", teacherId: "luana", kind: "extra", startsAt: sp("2026-10-30T10:00:00"), durationMinutes: 60, status: "pending", studentId: "ana", requestedById: "ana" },
      { id: "old-request", teacherId: "luana", kind: "extra", startsAt: sp("2026-10-27T10:00:00"), durationMinutes: 60, status: "pending", studentId: "ana", requestedById: "ana" },
    ]);
    await db.insert(invite).values([
      { tokenHash: "h1", kind: "trial", name: "Bia", invitedById: "luana", expiresAt: NOW, usedAt: sp("2026-10-25T10:00:00"), usedByUserId: "bia" },
      { tokenHash: "h2", kind: "student", name: "Antigo", invitedById: "luana", expiresAt: NOW, usedAt: sp("2026-10-01T10:00:00"), usedByUserId: "old" },
    ]);
    await db.insert(charge).values([
      { studentId: "ana", enrollmentId: e1!.id, kind: "first_prorated", amountCents: 8450, dueDate: "2026-10-20" },
      { studentId: "ana", enrollmentId: e1!.id, kind: "monthly", amountCents: 16900, dueDate: "2026-11-05", periodStart: "2026-11-05" },
      { studentId: "ana", enrollmentId: e1!.id, kind: "monthly", amountCents: 16900, dueDate: "2026-10-05", periodStart: "2026-10-05", status: "paid" },
    ]);
    await db.insert(whatsappMessage).values([
      { phoneNumber: "5511987654321", body: "Oi", sourceType: "announcement" },
      { phoneNumber: "5511987654321", body: "Lembrete", sourceType: "lesson_tomorrow", expiresAt: sp("2026-10-28T08:00:00") },
      { phoneNumber: "5511987654321", body: "Feito", sourceType: "announcement", status: "sent" },
    ]);
  });

  it("F-009: shows the teacher's day, requests, new students, charges and WhatsApp count", async () => {
    const data = await loadDashboard(db, { id: "luana", role: "teacher" }, NOW);
    expect(data.todayLessons.map((l) => l.id)).toEqual(["today"]);
    expect(data.todayLessons[0]).toMatchObject({
      groupName: "Turma de quarta",
      meetingUrl: "https://meet.google.com/aaa-bbbb-ccc",
      participants: ["Ana"],
    });
    expect(data.requests.map((r) => r.id)).toEqual(["request"]);
    expect(data.requests[0]?.requestedBy).toBe("Ana");
    expect(data.newStudents.map((s) => s.name)).toEqual(["Bia"]);
    expect(data.charges.map((c) => [c.kind, c.state])).toEqual([
      ["first_prorated", "overdue"],
      ["monthly", "pending"],
    ]);
    expect(data.firstPayments.map((c) => c.studentName)).toEqual(["Ana"]);
    expect(data.chargesSummary).toEqual({ open: 2, overdue: 1, totalCents: 25350 });
    expect(data.whatsapp).toBe(1);
  });

  it("F-009: a teacher only sees her own lessons and charges; admins see everything", async () => {
    const other = await loadDashboard(db, { id: "other", role: "teacher" }, NOW);
    expect(other.todayLessons.map((l) => l.id)).toEqual(["others"]);
    expect(other.charges).toEqual([]);
    const admin = await loadDashboard(db, { id: "admin", role: "admin" }, NOW);
    expect(admin.todayLessons.map((l) => l.id)).toEqual(["today", "others"]);
    expect(admin.charges).toHaveLength(2);
  });

  it("F-010: reads the student's CEFR level for the tone of fun messages", async () => {
    await db.insert(studentProfile).values({ userId: "ana", birthDate: "2000-01-01", cefrLevel: "B2" });
    expect(cefrBand(await cefrLevelOf(db, "ana"))).toBe("intermediate");
    expect(await cefrLevelOf(db, "bia")).toBeNull();
  });
});
