import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { credit, enrollment, lesson, lessonAttendance, plan, user } from "@/db/schema";
import { createTestDb } from "@/test/db";
import { createClassGroup, endClassGroup, enrollStudent, removeEnrollment, updateClassGroup } from "./groups";
import {
  cancelLessonByTeacher,
  checkLessonSlot,
  checkWeeklySlot,
  createOneOffLesson,
  createScheduleBlock,
  materializeWeeklyLessons,
  setAttendance,
  settleFinishedLessons,
} from "./lessons";
import { zonedDateTime } from "./rules";
import { joinLesson, listUpcomingLessonsForStudent } from "./student";

// Sunday 2026-11-01, 12:00 in São Paulo.
const NOW = zonedDateTime("2026-11-01", "12:00");

let db: Database;
let plan1h: string;
let plan2h: string;

async function addUser(id: string, role: "teacher" | "student" | "trial") {
  const at = new Date();
  await db.insert(user).values({ id, name: id, email: `${id}@test.local`, role, createdAt: at, updatedAt: at });
}

const tuesdayGroup = {
  name: "Business B1",
  lessonType: "business" as const,
  cefrLevel: "B1" as const,
  durationMinutes: 60,
  weekday: 2,
  startTime: "19:00",
  meetingUrl: "https://meet.google.com/abc-defg-hij",
  startsOn: "2026-11-01",
};

async function groupLessons(groupId: string) {
  return db.select().from(lesson).where(eq(lesson.classGroupId, groupId)).orderBy(lesson.startsAt);
}

beforeEach(async () => {
  db = await createTestDb();
  await addUser("luana", "teacher");
  await addUser("ana", "student");
  await addUser("bruno", "student");
  await addUser("carla", "student");
  await addUser("dani", "student");
  const plans = await db
    .insert(plan)
    .values([
      { name: "1h", durationMinutes: 60, priceCents: 16900 },
      { name: "2h", durationMinutes: 120, priceCents: 24900 },
    ])
    .returning();
  plan1h = plans[0]!.id;
  plan2h = plans[1]!.id;
});

async function groupWithAnaAndBruno() {
  const id = await createClassGroup(db, { ...tuesdayGroup, teacherId: "luana", now: NOW });
  await enrollStudent(db, { classGroupId: id, studentId: "ana", planId: plan1h, startedOn: "2026-11-01" });
  await enrollStudent(db, { classGroupId: id, studentId: "bruno", planId: plan1h, startedOn: "2026-11-01" });
  return id;
}

describe("weekly lessons", () => {
  it("F-003: creating a class group generates its weekly lessons", async () => {
    const id = await createClassGroup(db, { ...tuesdayGroup, teacherId: "luana", now: NOW });
    const lessons = await groupLessons(id);
    expect(lessons.length).toBe(8);
    expect(lessons[0]!.startsAt).toEqual(new Date("2026-11-03T22:00:00Z"));
    expect(lessons.every((l) => l.kind === "weekly" && l.status === "confirmed")).toBe(true);
  });

  it("materializing again does not duplicate lessons", async () => {
    const id = await createClassGroup(db, { ...tuesdayGroup, teacherId: "luana", now: NOW });
    expect(await materializeWeeklyLessons(db, NOW)).toBe(0);
    expect(await materializeWeeklyLessons(db, zonedDateTime("2026-11-08", "12:00"))).toBe(1);
    expect((await groupLessons(id)).length).toBe(9);
  });

  it("F-003: changing the schedule moves future lessons and keeps past ones", async () => {
    const id = await createClassGroup(db, { ...tuesdayGroup, teacherId: "luana", now: NOW });
    const later = zonedDateTime("2026-11-05", "12:00");
    await settleFinishedLessons(db, later);
    await updateClassGroup(db, { ...tuesdayGroup, id, weekday: 4, startTime: "18:00", now: later });
    const lessons = await groupLessons(id);
    expect(lessons[0]).toMatchObject({ startsAt: new Date("2026-11-03T22:00:00Z"), status: "done" });
    expect(lessons[1]!.startsAt).toEqual(new Date("2026-11-05T21:00:00Z"));
    expect(lessons.slice(1).every((l) => l.startsAt.getUTCDay() === 4)).toBe(true);
  });

  it("V4, RN-004: a new duration moves every participation to the plan of that duration", async () => {
    const id = await groupWithAnaAndBruno();
    await db.update(enrollment).set({ priceOverrideCents: 15000 }).where(eq(enrollment.studentId, "ana"));
    const result = await updateClassGroup(db, { ...tuesdayGroup, id, durationMinutes: 120, now: NOW });
    expect(result.planChanged).toBe(true);
    const rows = await db.select().from(enrollment).where(eq(enrollment.classGroupId, id));
    expect(rows.every((r) => r.planId === plan2h && r.priceOverrideCents === null)).toBe(true);
    const lessons = await groupLessons(id);
    expect(lessons.every((l) => l.durationMinutes === 120)).toBe(true);
  });

  it("V4: without a plan for the new duration, nothing changes", async () => {
    const id = await groupWithAnaAndBruno();
    await db.update(plan).set({ active: false }).where(eq(plan.id, plan2h));
    await expect(
      updateClassGroup(db, { ...tuesdayGroup, id, durationMinutes: 120, now: NOW }),
    ).rejects.toThrow("noPlanForDuration");
    const rows = await db.select().from(enrollment).where(eq(enrollment.classGroupId, id));
    expect(rows.every((r) => r.planId === plan1h)).toBe(true);
  });
});

describe("enrollment", () => {
  it("RN-004: a class group does not accept a 4th student", async () => {
    const id = await groupWithAnaAndBruno();
    await enrollStudent(db, { classGroupId: id, studentId: "carla", planId: plan1h, startedOn: "2026-11-01" });
    await expect(
      enrollStudent(db, { classGroupId: id, studentId: "dani", planId: plan1h, startedOn: "2026-11-01" }),
    ).rejects.toThrow("groupFull");
  });

  it("RN-004: the plan must match the class group duration", async () => {
    const id = await createClassGroup(db, { ...tuesdayGroup, teacherId: "luana", now: NOW });
    await expect(
      enrollStudent(db, { classGroupId: id, studentId: "ana", planId: plan2h, startedOn: "2026-11-01" }),
    ).rejects.toThrow("planMismatch");
  });

  it("RN-004: a student can be in two class groups, each with its own plan", async () => {
    await groupWithAnaAndBruno();
    const saturday = await createClassGroup(db, {
      ...tuesdayGroup,
      name: "Conversation",
      durationMinutes: 120,
      weekday: 6,
      startTime: "10:00",
      teacherId: "luana",
      now: NOW,
    });
    await enrollStudent(db, { classGroupId: saturday, studentId: "ana", planId: plan2h, startedOn: "2026-11-01" });
    const rows = await db.select().from(enrollment).where(eq(enrollment.studentId, "ana"));
    expect(rows.map((r) => r.planId).sort()).toEqual([plan1h, plan2h].sort());
  });

  it("F-003: a student who leaves stops seeing future lessons", async () => {
    const id = await groupWithAnaAndBruno();
    const [ana] = await db
      .select()
      .from(enrollment)
      .where(and(eq(enrollment.classGroupId, id), eq(enrollment.studentId, "ana")));
    await removeEnrollment(db, { enrollmentId: ana!.id, now: NOW });
    expect(await listUpcomingLessonsForStudent(db, { id: "ana", role: "student" }, NOW)).toEqual([]);
    expect((await listUpcomingLessonsForStudent(db, { id: "bruno", role: "student" }, NOW)).length).toBe(8);
  });
});

describe("schedule conflicts", () => {
  it("RN-003: warns when a weekly slot falls on a day that already has a lesson", async () => {
    await createClassGroup(db, { ...tuesdayGroup, teacherId: "luana", now: NOW });
    const issues = await checkWeeklySlot(db, {
      teacherId: "luana",
      weekday: 2,
      startTime: "09:00",
      startsOn: "2026-11-01",
      endsOn: null,
      durationMinutes: 60,
      maxLessonsPerDay: 1,
      now: NOW,
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toMatchObject({ overlapping: false, dailyLimitReached: true });
  });

  it("RN-003: a class group does not conflict with itself when edited", async () => {
    const id = await createClassGroup(db, { ...tuesdayGroup, teacherId: "luana", now: NOW });
    const issues = await checkWeeklySlot(db, {
      teacherId: "luana",
      weekday: 2,
      startTime: "19:30",
      startsOn: "2026-11-01",
      endsOn: null,
      durationMinutes: 60,
      excludeGroupId: id,
      maxLessonsPerDay: 1,
      now: NOW,
    });
    expect(issues).toEqual([]);
  });

  it("RN-002: a one-off lesson overlapping a weekly lesson is flagged", async () => {
    await createClassGroup(db, { ...tuesdayGroup, teacherId: "luana", now: NOW });
    const issue = await checkLessonSlot(db, {
      teacherId: "luana",
      startsAt: zonedDateTime("2026-11-03", "19:30"),
      durationMinutes: 60,
      maxLessonsPerDay: 2,
    });
    expect(issue).toMatchObject({ overlapping: true, dailyLimitReached: false, blocked: false });
  });
});

describe("cancellations and credits", () => {
  it("RN-011: the teacher cancels a lesson and each student gets a 30-day lesson credit", async () => {
    const id = await groupWithAnaAndBruno();
    const [first] = await groupLessons(id);
    const result = await cancelLessonByTeacher(db, { lessonId: first!.id, actorId: "luana", now: NOW });
    expect(result.creditedStudentIds.sort()).toEqual(["ana", "bruno"]);
    const credits = await db.select().from(credit);
    expect(credits).toHaveLength(2);
    expect(credits[0]).toMatchObject({ kind: "lesson", origin: "teacher_cancellation", sourceLessonId: first!.id });
    expect(credits[0]!.expiresAt).toEqual(new Date("2026-12-03T22:00:00Z"));
    await expect(cancelLessonByTeacher(db, { lessonId: first!.id, actorId: "luana", now: NOW })).rejects.toThrow(
      "notCancellable",
    );
  });

  it("RN-011: blocking days cancels the weekly lessons in them and gives credits", async () => {
    const id = await groupWithAnaAndBruno();
    const result = await createScheduleBlock(db, {
      teacherId: "luana",
      kind: "holiday",
      startsOn: "2026-11-10",
      endsOn: "2026-11-17",
      reason: "Feriadão",
      now: NOW,
    });
    expect(result.cancelled.map((c) => c.startsAt.toISOString())).toEqual([
      "2026-11-10T22:00:00.000Z",
      "2026-11-17T22:00:00.000Z",
    ]);
    const lessons = await groupLessons(id);
    expect(lessons.filter((l) => l.status === "cancelled_by_teacher")).toHaveLength(2);
    const credits = await db.select().from(credit).where(eq(credit.origin, "schedule_block"));
    expect(credits).toHaveLength(4);
  });

  it("F-004: a block beyond the materialized horizon still cancels its lessons", async () => {
    const id = await groupWithAnaAndBruno();
    await createScheduleBlock(db, {
      teacherId: "luana",
      kind: "holiday",
      startsOn: "2027-02-01",
      endsOn: "2027-02-07",
      reason: null,
      now: NOW,
    });
    const lessons = await groupLessons(id);
    const blocked = lessons.find((l) => l.startsAt.toISOString() === "2027-02-02T22:00:00.000Z");
    expect(blocked?.status).toBe("cancelled_by_teacher");
    // Later materialization does not bring a confirmed lesson back on that day.
    await materializeWeeklyLessons(db, zonedDateTime("2027-01-20", "12:00"));
    const again = (await groupLessons(id)).filter((l) => l.startsAt.toISOString() === "2027-02-02T22:00:00.000Z");
    expect(again).toHaveLength(1);
  });

  it("RN-015: a blocked participation gets no credit", async () => {
    const id = await groupWithAnaAndBruno();
    await db
      .update(enrollment)
      .set({ status: "blocked" })
      .where(and(eq(enrollment.classGroupId, id), eq(enrollment.studentId, "bruno")));
    const [first] = await groupLessons(id);
    const result = await cancelLessonByTeacher(db, { lessonId: first!.id, actorId: "luana", now: NOW });
    expect(result.creditedStudentIds).toEqual(["ana"]);
  });

  it("RN-027: leaving a class group cancels the credits of that participation", async () => {
    const id = await groupWithAnaAndBruno();
    const [first] = await groupLessons(id);
    await cancelLessonByTeacher(db, { lessonId: first!.id, actorId: "luana", now: NOW });
    await endClassGroup(db, { id, actorId: "luana", now: NOW });
    const credits = await db.select().from(credit);
    expect(credits.every((c) => c.status === "removed")).toBe(true);
    const lessons = await groupLessons(id);
    expect(lessons.every((l) => l.status === "cancelled_by_teacher")).toBe(true);
  });
});

describe("attendance", () => {
  async function marksOf(lessonId: string) {
    const marks = await db.select().from(lessonAttendance).where(eq(lessonAttendance.lessonId, lessonId));
    return Object.fromEntries(marks.map((m) => [m.studentId, m.status]));
  }

  it("V1, RN-008: tapping \"Entrar na aula\" records presence; who never taps is absent at the end", async () => {
    const id = await groupWithAnaAndBruno();
    const [first] = await groupLessons(id);
    const joined = await joinLesson(db, {
      lessonId: first!.id,
      viewer: { id: "ana", role: "student" },
      now: zonedDateTime("2026-11-03", "18:50"),
    });
    expect(joined).toEqual({ ok: true, meetingUrl: tuesdayGroup.meetingUrl });
    expect(await settleFinishedLessons(db, zonedDateTime("2026-11-03", "19:30"))).toBe(0);
    expect(await settleFinishedLessons(db, zonedDateTime("2026-11-03", "20:00"))).toBe(1);
    const [done] = await groupLessons(id);
    expect(done!.status).toBe("done");
    expect(await marksOf(first!.id)).toEqual({ ana: "present", bruno: "absent" });
  });

  it("V1, RN-010: joining more than 20 minutes late is an absence", async () => {
    const id = await groupWithAnaAndBruno();
    const [first] = await groupLessons(id);
    await joinLesson(db, { lessonId: first!.id, viewer: { id: "ana", role: "student" }, now: zonedDateTime("2026-11-03", "19:20") });
    await joinLesson(db, { lessonId: first!.id, viewer: { id: "bruno", role: "student" }, now: zonedDateTime("2026-11-03", "19:21") });
    expect(await marksOf(first!.id)).toEqual({ ana: "present", bruno: "late_absent" });
  });

  it("V1: the button only works from 15 minutes before the start until the end", async () => {
    const id = await groupWithAnaAndBruno();
    const [first] = await groupLessons(id);
    const viewer = { id: "ana", role: "student" as const };
    expect(await joinLesson(db, { lessonId: first!.id, viewer, now: zonedDateTime("2026-11-03", "18:44") })).toEqual({
      ok: false,
      reason: "closed",
    });
    expect((await joinLesson(db, { lessonId: first!.id, viewer, now: zonedDateTime("2026-11-03", "18:45") })).ok).toBe(true);
    expect(await marksOf(first!.id)).toEqual({ ana: "present" });
  });

  it("V1: the first tap counts, and a mark made by the teacher is kept", async () => {
    const id = await groupWithAnaAndBruno();
    const [first] = await groupLessons(id);
    await setAttendance(db, { lessonId: first!.id, studentId: "bruno", status: "present", actorId: "luana", now: zonedDateTime("2026-11-03", "19:05") });
    await joinLesson(db, { lessonId: first!.id, viewer: { id: "ana", role: "student" }, now: zonedDateTime("2026-11-03", "19:00") });
    await joinLesson(db, { lessonId: first!.id, viewer: { id: "ana", role: "student" }, now: zonedDateTime("2026-11-03", "19:40") });
    await joinLesson(db, { lessonId: first!.id, viewer: { id: "bruno", role: "student" }, now: zonedDateTime("2026-11-03", "19:45") });
    expect(await marksOf(first!.id)).toEqual({ ana: "present", bruno: "present" });
  });

  it("RN-015, RN-024: a blocked or outside student can't join", async () => {
    const id = await groupWithAnaAndBruno();
    await db.update(enrollment).set({ status: "blocked" }).where(eq(enrollment.studentId, "bruno"));
    const [first] = await groupLessons(id);
    const at = zonedDateTime("2026-11-03", "19:00");
    expect(await joinLesson(db, { lessonId: first!.id, viewer: { id: "bruno", role: "student" }, now: at })).toEqual({ ok: false, reason: "notFound" });
    expect(await joinLesson(db, { lessonId: first!.id, viewer: { id: "carla", role: "student" }, now: at })).toEqual({ ok: false, reason: "notFound" });
    expect(await marksOf(first!.id)).toEqual({});
  });

  it("attendance can only be marked for participants of a lesson that started", async () => {
    const id = await groupWithAnaAndBruno();
    const [first] = await groupLessons(id);
    await expect(
      setAttendance(db, { lessonId: first!.id, studentId: "ana", status: "absent", actorId: "luana", now: NOW }),
    ).rejects.toThrow("notStarted");
    await expect(
      setAttendance(db, {
        lessonId: first!.id,
        studentId: "carla",
        status: "absent",
        actorId: "luana",
        now: zonedDateTime("2026-11-03", "19:10"),
      }),
    ).rejects.toThrow("notParticipant");
  });
});

describe("student view", () => {
  it("RN-024: the link is only given to an active enrollment", async () => {
    const id = await groupWithAnaAndBruno();
    await db
      .update(enrollment)
      .set({ status: "blocked" })
      .where(and(eq(enrollment.classGroupId, id), eq(enrollment.studentId, "bruno")));
    const ana = await listUpcomingLessonsForStudent(db, { id: "ana", role: "student" }, NOW);
    const bruno = await listUpcomingLessonsForStudent(db, { id: "bruno", role: "student" }, NOW);
    expect(ana[0]).toMatchObject({ canJoin: true, hasMeetingLink: true });
    expect(ana[0]).not.toHaveProperty("meetingUrl");
    expect(bruno[0]).toMatchObject({ blocked: true, canJoin: false });
    expect(await listUpcomingLessonsForStudent(db, { id: "carla", role: "student" }, NOW)).toEqual([]);
  });

  it("RN-024: a lesson-specific link replaces the group link", async () => {
    const id = await groupWithAnaAndBruno();
    const [first] = await groupLessons(id);
    await db.update(lesson).set({ meetingUrl: "https://zoom.us/j/1" }).where(eq(lesson.id, first!.id));
    const lessons = await groupLessons(id);
    const viewer = { id: "ana", role: "student" as const };
    const first1 = await joinLesson(db, { lessonId: lessons[0]!.id, viewer, now: zonedDateTime("2026-11-03", "19:00") });
    const second = await joinLesson(db, { lessonId: lessons[1]!.id, viewer, now: zonedDateTime("2026-11-10", "19:00") });
    expect(first1).toEqual({ ok: true, meetingUrl: "https://zoom.us/j/1" });
    expect(second).toEqual({ ok: true, meetingUrl: tuesdayGroup.meetingUrl });
  });

  it("RN-018: a trial user only sees their trial lesson", async () => {
    await addUser("tina", "trial");
    await groupWithAnaAndBruno();
    await db.insert(lesson).values({
      teacherId: "luana",
      kind: "trial",
      studentId: "tina",
      startsAt: zonedDateTime("2026-11-05", "10:00"),
      durationMinutes: 60,
      meetingUrl: "https://meet.google.com/trial",
    });
    const tina = await listUpcomingLessonsForStudent(db, { id: "tina", role: "trial" }, NOW);
    expect(tina).toHaveLength(1);
    expect(tina[0]).toMatchObject({ kind: "trial", canJoin: true });
  });

  it("F-004: one-off lessons of the group show up for its students", async () => {
    const id = await groupWithAnaAndBruno();
    await createOneOffLesson(db, {
      classGroupId: id,
      startsAt: zonedDateTime("2026-11-06", "15:00"),
      durationMinutes: 120,
      meetingUrl: null,
      now: NOW,
    });
    const ana = await listUpcomingLessonsForStudent(db, { id: "ana", role: "student" }, NOW);
    expect(ana.find((l) => l.kind === "one_off")?.durationMinutes).toBe(120);
  });
});
