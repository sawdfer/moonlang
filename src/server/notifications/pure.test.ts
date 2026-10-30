import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../messages/en/notifications.json";
import ptMessages from "../../../messages/pt-BR/notifications.json";
import { buildNotificationEmail, createSmtpEmailSender } from "./email";
import { dueReminders, lessonPagePath, reminderRecipients } from "./reminders";
import { assertSafeContent, containsMeetingLink, isPlatformPath } from "./safety";
import { dateParams, interpolate, renderTemplate, renderWhatsAppText } from "./templates";
import { shouldSendEmail } from "./types";
import { normalizeWhatsAppNumber, waMeUrl } from "./whatsapp";

/** São Paulo is UTC-3 all year (no daylight saving time since 2019). */
const sp = (local: string) => new Date(`${local}-03:00`);

describe("meeting link guard (RN-024)", () => {
  it.each([
    "https://meet.google.com/abc-defg-hij",
    "entra aqui: meet.google.com/abc-defg-hij",
    "https://us02web.zoom.us/j/123456789?pwd=x",
    "zoom.us/j/123",
    "https://g.co/meet/abc",
    "https://acme.zoom.com/j/1",
  ])("detects %s", (text) => {
    expect(containsMeetingLink(text)).toBe(true);
  });

  it.each(["Sua aula é amanhã às 19:00", "/student/lessons/123", "https://moonlang.com.br/student", "zoomed in"])(
    "accepts %s",
    (text) => {
      expect(containsMeetingLink(text)).toBe(false);
    },
  );

  it("only accepts links that are paths inside the platform", () => {
    expect(isPlatformPath("/student/lessons/1")).toBe(true);
    expect(isPlatformPath("https://meet.google.com/x")).toBe(false);
    expect(isPlatformPath("//evil.example/x")).toBe(false);
    expect(() => assertSafeContent({ texts: ["ok"], link: "https://zoom.us/j/1" })).toThrow(/RN-024/);
    expect(() => assertSafeContent({ texts: ["link: meet.google.com/x"] })).toThrow(/RN-024/);
  });

  it("no message in the catalog contains a meeting link", () => {
    const all = JSON.stringify([ptMessages, enMessages]);
    expect(containsMeetingLink(all)).toBe(false);
  });
});

describe("WhatsApp links", () => {
  it("normalizes Brazilian mobiles and adds the country code", () => {
    expect(normalizeWhatsAppNumber("+55 (11) 98765-4321")).toBe("5511987654321");
    expect(normalizeWhatsAppNumber("11 98765-4321")).toBe("5511987654321");
    expect(normalizeWhatsAppNumber("+1 415 555 0100")).toBe("14155550100");
  });

  it("F-008: numbers that are not valid mobiles stay out of the queue", () => {
    expect(normalizeWhatsAppNumber(null)).toBeNull();
    expect(normalizeWhatsAppNumber("")).toBeNull();
    expect(normalizeWhatsAppNumber("11 3456-7890")).toBeNull(); // landline
    expect(normalizeWhatsAppNumber("12345")).toBeNull();
  });

  it("builds a wa.me link with the encoded text", () => {
    expect(waMeUrl("+5511987654321", "Oi, Ana! Aula às 19h & tal 🌙")).toBe(
      "https://wa.me/5511987654321?text=Oi%2C%20Ana!%20Aula%20%C3%A0s%2019h%20%26%20tal%20%F0%9F%8C%99",
    );
  });
});

describe("templates", () => {
  it("both languages have the same templates and parts", () => {
    const shape = (t: Record<string, Record<string, string>>) =>
      Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Object.keys(v).sort()]));
    expect(shape(enMessages.notifications.templates)).toEqual(shape(ptMessages.notifications.templates));
  });

  it("interpolates without re-reading values", () => {
    expect(interpolate("Oi, {name}! {missing}", { name: "{x} $&" })).toBe("Oi, {x} $&! {missing}");
  });

  it("RN-001: dates are shown in São Paulo time", () => {
    const at = new Date("2026-10-30T22:00:00Z"); // 19:00 in São Paulo
    expect(dateParams(at, "pt-BR")).toMatchObject({ date: "30/10", time: "19:00", weekday: "sexta-feira" });
    expect(dateParams(at, "en").weekday).toBe("Friday");
  });

  it("renders in the recipient's language", () => {
    const at = sp("2026-10-30T19:00:00");
    expect(renderTemplate({ key: "lessonTomorrow", at }, "pt-BR").body).toContain("às 19:00");
    expect(renderTemplate({ key: "lessonTomorrow", at }, "en").title).toBe("Lesson tomorrow! 🌙");
    expect(renderWhatsAppText({ key: "lessonInOneHour", at }, "pt-BR")).toBeNull();
  });
});

describe("dueReminders", () => {
  const lessonAt = sp("2026-10-30T19:00:00");

  it("F-008: sends 'aula amanhã' from 18:00 of the day before", () => {
    expect(dueReminders(lessonAt, sp("2026-10-29T17:59:00"))).toEqual([]);
    expect(dueReminders(lessonAt, sp("2026-10-29T18:00:00"))).toEqual(["lesson_tomorrow"]);
    expect(dueReminders(lessonAt, sp("2026-10-29T23:59:00"))).toEqual(["lesson_tomorrow"]);
  });

  it("does not send 'aula amanhã' on the day of the lesson", () => {
    expect(dueReminders(lessonAt, sp("2026-10-30T09:00:00"))).toEqual([]);
  });

  it("F-008: sends 'aula em 1 hora' during the last hour", () => {
    expect(dueReminders(lessonAt, sp("2026-10-30T17:59:00"))).toEqual([]);
    expect(dueReminders(lessonAt, sp("2026-10-30T18:00:00"))).toEqual(["lesson_in_one_hour"]);
    expect(dueReminders(lessonAt, sp("2026-10-30T18:50:00"))).toEqual(["lesson_in_one_hour"]);
    expect(dueReminders(lessonAt, sp("2026-10-30T19:00:00"))).toEqual([]);
  });

  it("uses the São Paulo calendar for an early-morning lesson", () => {
    const early = sp("2026-10-30T00:30:00"); // 03:30 UTC
    expect(dueReminders(early, sp("2026-10-29T18:00:00"))).toEqual(["lesson_tomorrow"]);
    expect(dueReminders(early, sp("2026-10-29T23:45:00"))).toEqual(["lesson_tomorrow", "lesson_in_one_hour"]);
  });
});

describe("reminderRecipients", () => {
  const lesson = { id: "l1", startsAt: sp("2026-10-30T19:00:00"), classGroupId: "g1", studentId: null };
  const enrollment = (studentId: string, extra: Partial<{ status: "active" | "blocked" | "dropped"; startedOn: string; classGroupId: string }> = {}) => ({
    classGroupId: "g1",
    studentId,
    status: "active" as const,
    startedOn: "2026-01-01",
    ...extra,
  });

  it("reminds active students of the class group only", () => {
    expect(
      reminderRecipients(
        lesson,
        [
          enrollment("ana"),
          enrollment("bia", { status: "blocked" }),
          enrollment("caio", { status: "dropped" }),
          enrollment("duda", { startedOn: "2026-11-01" }),
          enrollment("edu", { classGroupId: "g2" }),
        ],
        [],
      ),
    ).toEqual(["ana"]);
  });

  it("includes the lesson's own student and skips cancelled spots", () => {
    expect(
      reminderRecipients(
        { ...lesson, studentId: "extra" },
        [enrollment("ana"), enrollment("bia")],
        [{ studentId: "bia", status: "cancelled_in_time" }],
      ).sort(),
    ).toEqual(["ana", "extra"]);
  });

  it("RN-024: links to the lesson page inside the platform", () => {
    expect(lessonPagePath("l1")).toBe("/student/lessons/l1");
  });
});

describe("shouldSendEmail", () => {
  it("F-008: lesson and billing reminders cannot be turned off", () => {
    for (const type of ["lesson_tomorrow", "lesson_in_one_hour", "charge_due_soon", "charge_overdue"]) {
      expect(shouldSendEmail({ type, essential: false, nonEssentialEmails: false })).toBe(true);
    }
  });

  it("V9: every e-mail type is essential, whatever the preference", () => {
    expect(shouldSendEmail({ type: "materials_available", nonEssentialEmails: false })).toBe(true);
    expect(shouldSendEmail({ type: "materials_available", nonEssentialEmails: true })).toBe(true);
    expect(shouldSendEmail({ type: "something_else", essential: false, nonEssentialEmails: false })).toBe(false);
    expect(shouldSendEmail({ type: "announcement", nonEssentialEmails: false })).toBe(true);
  });
});

describe("e-mail", () => {
  it("links to the platform with an absolute URL and escapes HTML", () => {
    const email = buildNotificationEmail({
      to: "ana@example.com",
      recipientName: "Ana Souza",
      locale: "pt-BR",
      title: "Amanhã tem aula! 🌙",
      body: "<b>Oi</b>",
      link: "/student/lessons/l1",
      appUrl: "https://moonlang.com.br",
    });
    expect(email.text).toContain("Oi, Ana!");
    expect(email.text).toContain("https://moonlang.com.br/student/lessons/l1");
    expect(email.html).toContain("&lt;b&gt;Oi&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Oi</b>");
  });

  it("sends through SMTP with the reply-to address", async () => {
    const sendMail = vi.fn(async () => ({}));
    const sender = createSmtpEmailSender({
      transport: { sendMail },
      from: "Moonlang <ola@moonlang.com.br>",
      replyTo: "luana@example.com",
    });
    await sender.send({ to: "ana@example.com", subject: "Oi", text: "t", html: "<p>t</p>" });
    expect(sendMail).toHaveBeenCalledWith({
      from: "Moonlang <ola@moonlang.com.br>",
      to: "ana@example.com",
      replyTo: "luana@example.com",
      subject: "Oi",
      text: "t",
      html: "<p>t</p>",
    });
  });

  it("throws when the SMTP server rejects the e-mail", async () => {
    const sendMail = vi.fn(async () => {
      throw new Error("550 mailbox unavailable");
    });
    const sender = createSmtpEmailSender({ transport: { sendMail }, from: "f" });
    await expect(sender.send({ to: "a@b.c", subject: "s", text: "t", html: "h" })).rejects.toThrow(/550/);
  });
});
