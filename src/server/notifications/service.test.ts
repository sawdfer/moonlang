import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import {
  announcement,
  classGroup,
  enrollment,
  lesson,
  notification,
  plan,
  user,
  userPreference,
  whatsappMessage,
} from "@/db/schema";
import { createTestDb } from "@/test/db";
import type { EmailMessage, EmailSender } from "./email";
import { listNotifications, listWhatsAppQueue, markRead } from "./queries";
import { containsMeetingLink } from "./safety";
import {
  AnnouncementError,
  type NotificationDeps,
  notifyWith,
  queueWhatsAppWith,
  runReminders,
  sendAnnouncement,
} from "./service";

const sp = (local: string) => new Date(`${local}-03:00`);
const MEETING_URL = "https://meet.google.com/abc-defg-hij";

class FakeSender implements EmailSender {
  readonly name = "fake";
  sent: EmailMessage[] = [];
  failNext = 0;
  async send(message: EmailMessage) {
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error("provider down");
    }
    this.sent.push(message);
  }
}

let db: Database;
let email: FakeSender;
let deps: NotificationDeps;

async function addUser(
  id: string,
  extra: Partial<typeof user.$inferInsert> = {},
  pref?: Partial<typeof userPreference.$inferInsert>,
) {
  const now = new Date();
  await db.insert(user).values({
    id,
    name: `${id[0]?.toUpperCase()}${id.slice(1)} Silva`,
    email: `${id}@example.com`,
    role: "student",
    createdAt: now,
    updatedAt: now,
    ...extra,
  });
  if (pref) await db.insert(userPreference).values({ userId: id, ...pref });
}

beforeEach(async () => {
  db = await createTestDb();
  email = new FakeSender();
  deps = { db, email, appUrl: "https://moonlang.com.br" };
});

describe("notify", () => {
  it("stores the notification and e-mails it in the user's language", async () => {
    await addUser("ana", {}, { locale: "en" });
    const id = await notifyWith(deps, {
      userId: "ana",
      type: "lesson_tomorrow",
      template: { key: "lessonTomorrow", at: sp("2026-10-30T19:00:00") },
      link: "/student/lessons/l1",
      sendEmail: true,
    });
    const [row] = await db.select().from(notification).where(eq(notification.id, id!));
    expect(row).toMatchObject({ title: "Lesson tomorrow! 🌙", emailStatus: "sent", emailAttempts: 1 });
    expect(email.sent[0]?.subject).toBe("Lesson tomorrow! 🌙");
  });

  it("keeps plain title/body calls working (backward compatible)", async () => {
    await addUser("ana");
    await notifyWith(deps, { userId: "ana", type: "custom", title: "Oi", body: "Tudo bem?" });
    const { items } = await listNotifications(db, "ana");
    expect(items).toHaveLength(1);
    expect(email.sent).toHaveLength(0);
  });

  it("F-008: skips non-essential e-mails when the user turned them off", async () => {
    await addUser("ana", {}, { nonEssentialEmails: false });
    await notifyWith(deps, { userId: "ana", type: "materials_available", title: "Material novo", sendEmail: true });
    await notifyWith(deps, { userId: "ana", type: "charge_due_soon", title: "Mensalidade", sendEmail: true });
    expect(email.sent.map((m) => m.subject)).toEqual(["Mensalidade"]);
    expect((await listNotifications(db, "ana")).items).toHaveLength(2);
  });

  it("RN-024: rejects meeting links in texts and links", async () => {
    await addUser("ana");
    await expect(notifyWith(deps, { userId: "ana", type: "x", title: "Aula", body: MEETING_URL })).rejects.toThrow(/RN-024/);
    await expect(notifyWith(deps, { userId: "ana", type: "x", title: "Aula", link: MEETING_URL })).rejects.toThrow(/RN-024/);
    await expect(
      queueWhatsAppWith(deps, { phoneNumber: "+5511987654321", body: `Link: ${MEETING_URL}`, sourceType: "x" }),
    ).rejects.toThrow(/RN-024/);
  });

  it("F-008: a failed e-mail stays in the center and is retried", async () => {
    await addUser("ana");
    email.failNext = 1;
    await notifyWith(deps, { userId: "ana", type: "x", title: "Oi", sendEmail: true });
    const [failed] = await db.select().from(notification);
    expect(failed?.emailStatus).toBe("failed");

    const result = await runReminders(deps, new Date(Date.now() + 5 * 60_000));
    expect(result.emailRetries).toBe(1);
    const [retried] = await db.select().from(notification);
    expect(retried).toMatchObject({ emailStatus: "sent", emailAttempts: 2 });
  });

  it("ignores a repeated dedupe key", async () => {
    await addUser("ana");
    expect(await notifyWith(deps, { userId: "ana", type: "x", title: "Oi", dedupeKey: "k" })).not.toBeNull();
    expect(await notifyWith(deps, { userId: "ana", type: "x", title: "Oi", dedupeKey: "k" })).toBeNull();
  });
});

describe("notification center", () => {
  it("a user only marks their own notifications as read", async () => {
    await addUser("ana");
    await addUser("bia");
    const anaId = await notifyWith(deps, { userId: "ana", type: "x", title: "Oi Ana" });
    await notifyWith(deps, { userId: "bia", type: "x", title: "Oi Bia" });

    await markRead(db, "bia", [anaId!], new Date());
    expect((await listNotifications(db, "ana")).unread).toBe(1);

    await markRead(db, "bia", "all", new Date());
    expect((await listNotifications(db, "ana")).unread).toBe(1);
    expect((await listNotifications(db, "bia")).unread).toBe(0);
  });
});

describe("WhatsApp queue", () => {
  it("F-008: skips invalid numbers and hides expired reminders", async () => {
    await addUser("ana");
    expect(await queueWhatsAppWith(deps, { phoneNumber: "123", body: "Oi", sourceType: "x" })).toBeNull();
    await queueWhatsAppWith(deps, {
      recipientId: "ana",
      phoneNumber: "(11) 98765-4321",
      body: "Lembrete",
      sourceType: "lesson_tomorrow",
      expiresAt: sp("2026-10-30T19:00:00"),
    });
    expect(await listWhatsAppQueue(db, sp("2026-10-30T18:00:00"))).toMatchObject([
      { phoneNumber: "5511987654321", recipientName: "Ana Silva" },
    ]);
    expect(await listWhatsAppQueue(db, sp("2026-10-30T19:00:00"))).toEqual([]);
  });
});

async function seedClassGroup() {
  await addUser("luana", { role: "teacher" });
  await addUser("ana", { phoneNumber: "+5511987654321" });
  await addUser("bia", {}, { locale: "en" });
  await addUser("caio", { phoneNumber: "+5511912345678" });
  const [p] = await db.insert(plan).values({ name: "1h", durationMinutes: 60, priceCents: 16900 }).returning();
  await db.insert(classGroup).values({
    id: "g1",
    teacherId: "luana",
    name: "Turma das quintas",
    lessonType: "conversation",
    durationMinutes: 60,
    weekday: 5,
    startTime: "19:00",
    meetingUrl: MEETING_URL,
    startsOn: "2026-01-01",
  });
  await db.insert(enrollment).values([
    { classGroupId: "g1", studentId: "ana", planId: p!.id, startedOn: "2026-01-01" },
    { classGroupId: "g1", studentId: "bia", planId: p!.id, startedOn: "2026-01-01" },
    { classGroupId: "g1", studentId: "caio", planId: p!.id, startedOn: "2026-01-01", status: "dropped" },
  ]);
  await db.insert(lesson).values({
    id: "l1",
    classGroupId: "g1",
    teacherId: "luana",
    kind: "weekly",
    startsAt: sp("2026-10-30T19:00:00"),
    durationMinutes: 60,
    meetingUrl: MEETING_URL,
  });
}

describe("lesson reminders", () => {
  it("F-008: sends 'aula amanhã' at 18:00 and 'aula em 1 hora', once each", async () => {
    await seedClassGroup();

    expect((await runReminders(deps, sp("2026-10-29T17:55:00"))).notifications).toBe(0);

    const dayBefore = await runReminders(deps, sp("2026-10-29T18:05:00"));
    expect(dayBefore).toMatchObject({ notifications: 2, whatsapp: 1 });
    expect((await runReminders(deps, sp("2026-10-29T18:15:00"))).notifications).toBe(0);

    const oneHour = await runReminders(deps, sp("2026-10-30T18:05:00"));
    expect(oneHour).toMatchObject({ notifications: 2, whatsapp: 0 });
    expect((await runReminders(deps, sp("2026-10-30T18:20:00"))).notifications).toBe(0);

    const rows = await db.select().from(notification);
    expect(rows.map((r) => `${r.userId}:${r.type}`).sort()).toEqual([
      "ana:lesson_in_one_hour",
      "ana:lesson_tomorrow",
      "bia:lesson_in_one_hour",
      "bia:lesson_tomorrow",
    ]);
    expect(rows.every((r) => r.link === "/student/lessons/l1")).toBe(true);
    expect(rows.find((r) => r.userId === "bia" && r.type === "lesson_tomorrow")?.title).toBe("Lesson tomorrow! 🌙");
    expect(email.sent).toHaveLength(4);
  });

  it("does not remind cancelled lessons", async () => {
    await seedClassGroup();
    await db.update(lesson).set({ status: "cancelled_by_teacher" });
    expect((await runReminders(deps, sp("2026-10-29T18:05:00"))).notifications).toBe(0);
  });

  it("RN-024: no notification, e-mail or WhatsApp message contains the meeting link", async () => {
    await seedClassGroup();
    await runReminders(deps, sp("2026-10-29T18:05:00"));
    await runReminders(deps, sp("2026-10-30T18:05:00"));
    await sendAnnouncement(deps, {
      authorId: "luana",
      authorName: "Luana",
      body: "Sem aula no feriado!",
      audience: { all: true },
    });

    const stored = JSON.stringify([
      await db.select().from(notification),
      await db.select().from(whatsappMessage),
    ]);
    expect(email.sent.length).toBeGreaterThan(0);
    expect(containsMeetingLink(stored)).toBe(false);
    expect(containsMeetingLink(JSON.stringify(email.sent))).toBe(false);
    expect(email.sent.every((m) => m.text.includes("https://moonlang.com.br/student/lessons/l1") || m.subject.includes("comunicado") || m.subject.includes("Announcement"))).toBe(true);
  });
});

describe("announcements", () => {
  it("F-008: reaches the center, e-mail and WhatsApp queue of current students", async () => {
    await seedClassGroup();
    const result = await sendAnnouncement(deps, {
      authorId: "luana",
      authorName: "Luana Ferraz",
      body: "  Não haverá aula no feriado 🎉  ",
      audience: { classGroupIds: ["g1"] },
    });
    // caio dropped out; bia has no phone number, so only ana gets a WhatsApp draft.
    expect(result).toMatchObject({ recipients: 2, whatsapp: 1 });
    const [stored] = await db.select().from(announcement);
    expect(stored?.body).toBe("Não haverá aula no feriado 🎉");
    expect((await listNotifications(db, "ana")).items[0]?.title).toBe("Novo comunicado de Luana 📣");
    expect((await listNotifications(db, "bia")).items[0]?.title).toBe("Announcement from Luana 📣");
    expect(email.sent).toHaveLength(2);
    const [draft] = await listWhatsAppQueue(db, new Date());
    expect(draft?.body).toBe("Oi, Ana! 📣 Não haverá aula no feriado 🎉");
  });

  it("only addresses students, never staff ids sent by the client", async () => {
    await seedClassGroup();
    const result = await sendAnnouncement(deps, {
      authorId: "luana",
      authorName: "Luana",
      body: "Oi",
      audience: { userIds: ["luana", "bia"] },
    });
    expect(result.recipients).toBe(1);
  });

  it("rejects empty texts, meeting links and empty audiences", async () => {
    await seedClassGroup();
    const send = (body: string, audience: Parameters<typeof sendAnnouncement>[1]["audience"]) =>
      sendAnnouncement(deps, { authorId: "luana", authorName: "Luana", body, audience });
    await expect(send("   ", { all: true })).rejects.toEqual(new AnnouncementError("empty"));
    await expect(send(`Link novo: ${MEETING_URL}`, { all: true })).rejects.toEqual(new AnnouncementError("meetingLink"));
    await expect(send("Oi", { classGroupIds: [] })).rejects.toEqual(new AnnouncementError("noRecipients"));
  });
});
