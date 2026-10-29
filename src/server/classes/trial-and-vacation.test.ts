import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { credit, enrollment, lesson, plan, studentProfile, trialRecord, user } from "@/db/schema";
import { createTestDb } from "@/test/db";
import { createClassGroup, enrollStudent } from "./groups";
import { cancelLessonByTeacher, createScheduleBlock, syncSchedule } from "./lessons";
import { zonedDateTime } from "./rules";
import { joinLesson, listUpcomingLessonsForStudent } from "./student";
import { checkTrialEligibility, recordTrialOutcome, scheduleTrialLesson } from "./trial";

// Sunday 2026-11-01, 12:00 in São Paulo.
const NOW = zonedDateTime("2026-11-01", "12:00");

let db: Database;
let plan1h: string;

async function addUser(id: string, role: "teacher" | "student" | "trial", phoneNumber: string | null = null) {
  const at = new Date();
  await db
    .insert(user)
    .values({ id, name: id, email: `${id}@test.local`, role, phoneNumber, createdAt: at, updatedAt: at });
}

beforeEach(async () => {
  db = await createTestDb();
  await addUser("luana", "teacher");
  await addUser("ana", "student");
  await addUser("bruno", "student");
  const [p] = await db.insert(plan).values({ name: "1h", durationMinutes: 60, priceCents: 16900 }).returning();
  plan1h = p!.id;
});

async function tuesdayGroup() {
  const id = await createClassGroup(db, {
    name: "Business B1",
    lessonType: "business",
    cefrLevel: "B1",
    durationMinutes: 60,
    weekday: 2,
    startTime: "19:00",
    meetingUrl: "https://meet.google.com/abc-defg-hij",
    startsOn: "2026-11-01",
    teacherId: "luana",
    now: NOW,
  });
  await enrollStudent(db, { classGroupId: id, studentId: "ana", planId: plan1h, startedOn: "2026-11-01" });
  await enrollStudent(db, { classGroupId: id, studentId: "bruno", planId: plan1h, startedOn: "2026-11-01" });
  return id;
}

async function firstLesson(groupId: string) {
  const [row] = await db.select().from(lesson).where(eq(lesson.classGroupId, groupId)).orderBy(lesson.startsAt);
  return row!;
}

describe("vacations (V2)", () => {
  it("V2, RN-011: a vacation makes every open credit expire when it starts", async () => {
    const id = await tuesdayGroup();
    await cancelLessonByTeacher(db, { lessonId: (await firstLesson(id)).id, actorId: "luana", now: NOW });
    // A birthday credit, with no participation, is open too.
    await db.insert(credit).values({
      studentId: "ana",
      kind: "lesson",
      origin: "birthday",
      expiresAt: zonedDateTime("2026-12-30", "12:00"),
    });

    const result = await createScheduleBlock(db, {
      teacherId: "luana",
      kind: "vacation",
      startsOn: "2026-11-20",
      endsOn: "2026-12-10",
      reason: "Férias",
      now: NOW,
    });

    const vacationStart = zonedDateTime("2026-11-20", "00:00");
    const credits = await db.select().from(credit);
    expect(credits.every((c) => c.expiresAt <= vacationStart)).toBe(true);
    expect(Object.fromEntries(result.expiringCredits)).toEqual({ ana: 2, bruno: 1 });
    // Lessons inside the vacation were cancelled and their credits also end when it starts.
    const fromBlock = credits.filter((c) => c.origin === "schedule_block");
    expect(fromBlock.length).toBe(result.cancelled.length * 2);
    expect(fromBlock.every((c) => c.expiresAt.getTime() === vacationStart.getTime())).toBe(true);
  });

  it("V2: a holiday does not touch credits", async () => {
    const id = await tuesdayGroup();
    await cancelLessonByTeacher(db, { lessonId: (await firstLesson(id)).id, actorId: "luana", now: NOW });
    const before = await db.select().from(credit);
    const result = await createScheduleBlock(db, {
      teacherId: "luana",
      kind: "holiday",
      startsOn: "2026-11-20",
      endsOn: "2026-11-20",
      reason: null,
      now: NOW,
    });
    expect(result.expiringCredits.size).toBe(0);
    const after = await db.select().from(credit);
    expect(after.map((c) => c.expiresAt)).toEqual(before.map((c) => c.expiresAt));
  });

  it("V2: credits granted after a vacation was planned also end when it starts", async () => {
    const id = await tuesdayGroup();
    await createScheduleBlock(db, {
      teacherId: "luana",
      kind: "vacation",
      startsOn: "2026-11-20",
      endsOn: "2026-11-30",
      reason: null,
      now: NOW,
    });
    const result = await cancelLessonByTeacher(db, { lessonId: (await firstLesson(id)).id, actorId: "luana", now: NOW });
    expect(result.creditExpiresAt).toEqual(zonedDateTime("2026-11-20", "00:00"));
  });

  it("RN-011: credits past their expiry become expired", async () => {
    const id = await tuesdayGroup();
    await cancelLessonByTeacher(db, { lessonId: (await firstLesson(id)).id, actorId: "luana", now: NOW });
    await syncSchedule(db, zonedDateTime("2026-12-04", "12:00"));
    const credits = await db.select().from(credit);
    expect(credits.every((c) => c.status === "expired")).toBe(true);
  });
});

describe("trial lessons (F-006)", () => {
  beforeEach(async () => {
    await addUser("tina", "trial", "+5511999990000");
    await db.insert(studentProfile).values({ userId: "tina", birthDate: "1990-01-01" });
  });

  it("RN-018: staff schedule a free 1h trial lesson that only the trial user sees", async () => {
    await tuesdayGroup();
    const lessonId = await scheduleTrialLesson(db, {
      userId: "tina",
      teacherId: "luana",
      startsAt: zonedDateTime("2026-11-05", "10:00"),
      meetingUrl: "https://meet.google.com/trial",
      now: NOW,
    });
    const [row] = await db.select().from(lesson).where(eq(lesson.id, lessonId));
    expect(row).toMatchObject({ kind: "trial", durationMinutes: 60, status: "confirmed", studentId: "tina" });
    const tina = await listUpcomingLessonsForStudent(db, { id: "tina", role: "trial" }, NOW);
    expect(tina.map((l) => l.id)).toEqual([lessonId]);
    const joined = await joinLesson(db, {
      lessonId,
      viewer: { id: "tina", role: "trial" },
      now: zonedDateTime("2026-11-05", "09:55"),
    });
    expect(joined).toEqual({ ok: true, meetingUrl: "https://meet.google.com/trial" });
    const ana = await listUpcomingLessonsForStudent(db, { id: "ana", role: "student" }, NOW);
    expect(ana.some((l) => l.id === lessonId)).toBe(false);
  });

  it("RN-018: only for trial users", async () => {
    await expect(
      scheduleTrialLesson(db, {
        userId: "ana",
        teacherId: "luana",
        startsAt: zonedDateTime("2026-11-05", "10:00"),
        meetingUrl: "https://meet.google.com/trial",
        now: NOW,
      }),
    ).rejects.toThrow("notATrial");
  });

  it("RN-018: warns when the person had a trial in the last 3 months", async () => {
    await scheduleTrialLesson(db, {
      userId: "tina",
      teacherId: "luana",
      startsAt: zonedDateTime("2026-11-05", "10:00"),
      meetingUrl: "https://meet.google.com/trial",
      now: NOW,
    });
    expect(await checkTrialEligibility(db, { userId: "tina", startsAt: zonedDateTime("2027-01-10", "10:00") })).toEqual({
      allowed: false,
      nextAllowedOn: "2027-02-05",
    });
    expect(
      (await checkTrialEligibility(db, { userId: "tina", startsAt: zonedDateTime("2027-02-05", "10:00") })).allowed,
    ).toBe(true);
  });

  it("RN-018: a cancelled trial does not count", async () => {
    const lessonId = await scheduleTrialLesson(db, {
      userId: "tina",
      teacherId: "luana",
      startsAt: zonedDateTime("2026-11-05", "10:00"),
      meetingUrl: "https://meet.google.com/trial",
      now: NOW,
    });
    const cancelled = await cancelLessonByTeacher(db, { lessonId, actorId: "luana", now: NOW });
    expect(cancelled.creditedStudentIds).toEqual([]);
    expect(
      (await checkTrialEligibility(db, { userId: "tina", startsAt: zonedDateTime("2026-11-20", "10:00") })).allowed,
    ).toBe(true);
  });

  it("RN-018: after the lesson the teacher records level and outcome; the level goes to the profile", async () => {
    const lessonId = await scheduleTrialLesson(db, {
      userId: "tina",
      teacherId: "luana",
      startsAt: zonedDateTime("2026-11-05", "10:00"),
      meetingUrl: "https://meet.google.com/trial",
      now: NOW,
    });
    await expect(
      recordTrialOutcome(db, { lessonId, cefrLevel: "B1", outcome: "converted", notes: null, now: NOW }),
    ).rejects.toThrow("notStarted");
    await recordTrialOutcome(db, {
      lessonId,
      cefrLevel: "B1",
      outcome: "converted",
      notes: "Ótima conversa",
      now: zonedDateTime("2026-11-05", "11:00"),
    });
    const [record] = await db.select().from(trialRecord).where(eq(trialRecord.lessonId, lessonId));
    expect(record).toMatchObject({ cefrLevel: "B1", outcome: "converted", notes: "Ótima conversa" });
    const [profile] = await db.select().from(studentProfile).where(eq(studentProfile.userId, "tina"));
    expect(profile!.cefrLevel).toBe("B1");
  });

  it("F-006: a trial user can be placed in a class to convert", async () => {
    const id = await createClassGroup(db, {
      name: "Solo",
      lessonType: "conversation",
      cefrLevel: null,
      durationMinutes: 60,
      weekday: 4,
      startTime: "18:00",
      meetingUrl: null,
      startsOn: "2026-11-01",
      teacherId: "luana",
      now: NOW,
    });
    await enrollStudent(db, { classGroupId: id, studentId: "tina", planId: plan1h, startedOn: "2026-11-01" });
    const rows = await db.select().from(enrollment).where(eq(enrollment.studentId, "tina"));
    expect(rows).toHaveLength(1);
    // Until the first charge is paid, the trial user still only sees trial lessons (RN-018).
    expect(await listUpcomingLessonsForStudent(db, { id: "tina", role: "trial" }, NOW)).toEqual([]);
  });
});
