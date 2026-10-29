// Database-backed core of the notifications domain (F-008). Dependencies are
// passed in so tests can use an in-memory database and a fake e-mail sender;
// app code goes through `./index.ts`.
import { and, eq, gt, inArray, lt, lte, ne, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  announcement,
  enrollment,
  lesson,
  lessonAttendance,
  notification,
  user,
  userPreference,
  whatsappMessage,
} from "@/db/schema";
import { buildNotificationEmail, type EmailSender } from "./email";
import {
  dueReminders,
  LOOKAHEAD_MS,
  lessonPagePath,
  type ReminderKind,
  reminderDedupeKey,
  reminderRecipients,
} from "./reminders";
import { assertSafeContent, containsMeetingLink } from "./safety";
import {
  type NotificationTemplate,
  renderTemplate,
  renderWhatsAppText,
  resolveLocale,
} from "./templates";
import { NOTIFICATION_TYPES, shouldSendEmail } from "./types";
import { normalizeWhatsAppNumber } from "./whatsapp";

export type NotificationDeps = {
  db: Database;
  email: EmailSender;
  /** Base URL of the platform, used to turn platform paths into e-mail links. */
  appUrl: string;
  log?: (message: string, error?: unknown) => void;
};

export type NotifyInput = {
  userId: string;
  type: string;
  /** Fixed texts. Prefer `template` so the message follows the recipient's language. */
  title?: string;
  body?: string;
  /** Rendered in the recipient's language; takes precedence over title/body. */
  template?: NotificationTemplate;
  /** Path inside the platform, e.g. "/student/lessons/123". Never a meeting URL (RN-024). */
  link?: string;
  sendEmail?: boolean;
  /** Overrides the default classification used for the "non-essential e-mails" preference. */
  essential?: boolean;
  /** When set, a second call with the same key is ignored (returns null). */
  dedupeKey?: string;
};

export type QueueWhatsAppInput = {
  recipientId?: string;
  /** Messages without a valid mobile number stay out of the queue (F-008). */
  phoneNumber: string | null | undefined;
  body: string;
  sourceType: string;
  sourceId?: string;
  /** Reminders leave the queue once they are no longer useful. */
  expiresAt?: Date;
};

export const MAX_EMAIL_ATTEMPTS = 5;
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const ANNOUNCEMENT_MAX_LENGTH = 2000;

type Recipient = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  locale: ReturnType<typeof resolveLocale>;
  nonEssentialEmails: boolean;
};

async function loadRecipients(db: Database, userIds: string[]): Promise<Map<string, Recipient>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      locale: userPreference.locale,
      nonEssentialEmails: userPreference.nonEssentialEmails,
    })
    .from(user)
    .leftJoin(userPreference, eq(userPreference.userId, user.id))
    .where(inArray(user.id, userIds));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        ...r,
        locale: resolveLocale(r.locale),
        nonEssentialEmails: r.nonEssentialEmails ?? true,
      },
    ]),
  );
}

async function deliverEmail(
  deps: NotificationDeps,
  notificationId: string,
  recipient: Recipient,
  content: { title: string; body: string; link: string | null },
): Promise<boolean> {
  let ok = true;
  try {
    const message = buildNotificationEmail({
      to: recipient.email,
      recipientName: recipient.name,
      locale: recipient.locale,
      appUrl: deps.appUrl,
      ...content,
    });
    assertSafeContent({ texts: [message.subject, message.text, message.html] });
    await deps.email.send(message);
  } catch (error) {
    ok = false;
    deps.log?.(`E-mail for notification ${notificationId} failed`, error);
  }
  await deps.db
    .update(notification)
    .set({
      emailStatus: ok ? "sent" : "failed",
      emailAttempts: sql`${notification.emailAttempts} + 1`,
    })
    .where(eq(notification.id, notificationId));
  return ok;
}

/**
 * Stores an in-app notification and, when asked and allowed by the user's
 * preferences, e-mails it. E-mail failures never throw: the notification stays
 * in the center and the reminders job retries the e-mail.
 * Returns the notification id, or null when `dedupeKey` was already used.
 */
export async function notifyWith(deps: NotificationDeps, input: NotifyInput): Promise<string | null> {
  const recipient = (await loadRecipients(deps.db, [input.userId])).get(input.userId);
  if (!recipient) throw new Error(`notify(): unknown user ${input.userId}`);

  const content = input.template
    ? renderTemplate(input.template, recipient.locale)
    : { title: input.title ?? "", body: input.body ?? "" };
  if (!content.title) throw new Error("notify(): a title or a template is required");
  const link = input.link ?? null;
  assertSafeContent({ texts: [content.title, content.body], link });

  const wantsEmail =
    Boolean(input.sendEmail) &&
    shouldSendEmail({
      type: input.type,
      essential: input.essential,
      nonEssentialEmails: recipient.nonEssentialEmails,
    });

  const [row] = await deps.db
    .insert(notification)
    .values({
      userId: input.userId,
      type: input.type,
      title: content.title,
      body: content.body,
      link,
      emailStatus: wantsEmail ? "pending" : "none",
      dedupeKey: input.dedupeKey,
    })
    .onConflictDoNothing()
    .returning({ id: notification.id });
  if (!row) return null;

  if (wantsEmail) await deliverEmail(deps, row.id, recipient, { ...content, link });
  return row.id;
}

/** Adds a ready-made message to the teacher's WhatsApp queue. Returns null when the number is not valid. */
export async function queueWhatsAppWith(
  deps: NotificationDeps,
  input: QueueWhatsAppInput,
): Promise<string | null> {
  const phoneNumber = normalizeWhatsAppNumber(input.phoneNumber);
  if (!phoneNumber) return null;
  assertSafeContent({ texts: [input.body] });
  const [row] = await deps.db
    .insert(whatsappMessage)
    .values({ ...input, phoneNumber })
    .returning({ id: whatsappMessage.id });
  return row?.id ?? null;
}

/** Retries e-mails that failed (or were interrupted) in the last 24 hours. */
export async function retryFailedEmails(deps: NotificationDeps, now: Date): Promise<number> {
  const rows = await deps.db
    .select()
    .from(notification)
    .where(
      and(
        inArray(notification.emailStatus, ["failed", "pending"]),
        lt(notification.emailAttempts, MAX_EMAIL_ATTEMPTS),
        gt(notification.createdAt, new Date(now.getTime() - RETRY_WINDOW_MS)),
        // Leave e-mails that are being sent right now alone.
        lt(notification.createdAt, new Date(now.getTime() - 60_000)),
      ),
    );
  const recipients = await loadRecipients(deps.db, [...new Set(rows.map((r) => r.userId))]);
  let sent = 0;
  for (const row of rows) {
    const recipient = recipients.get(row.userId);
    if (!recipient) continue;
    if (await deliverEmail(deps, row.id, recipient, row)) sent++;
  }
  return sent;
}

const REMINDER_TEMPLATE: Record<ReminderKind, NotificationTemplate["key"]> = {
  lesson_tomorrow: "lessonTomorrow",
  lesson_in_one_hour: "lessonInOneHour",
};

export type ReminderRunResult = { notifications: number; whatsapp: number; emailRetries: number };

/**
 * Sends the lesson reminders due at `now` (F-008). Safe to run as often as
 * wanted: each reminder has a dedupe key per lesson and student.
 */
export async function runReminders(deps: NotificationDeps, now: Date): Promise<ReminderRunResult> {
  const { db } = deps;
  const lessons = await db
    .select({
      id: lesson.id,
      startsAt: lesson.startsAt,
      classGroupId: lesson.classGroupId,
      studentId: lesson.studentId,
    })
    .from(lesson)
    .where(
      and(
        eq(lesson.status, "confirmed"),
        gt(lesson.startsAt, now),
        lte(lesson.startsAt, new Date(now.getTime() + LOOKAHEAD_MS)),
      ),
    );
  const due = lessons
    .map((l) => ({ lesson: l, kinds: dueReminders(l.startsAt, now) }))
    .filter((d) => d.kinds.length > 0);

  const result: ReminderRunResult = { notifications: 0, whatsapp: 0, emailRetries: 0 };
  if (due.length > 0) {
    const groupIds = [...new Set(due.map((d) => d.lesson.classGroupId).filter((id) => id !== null))];
    const enrollments = groupIds.length
      ? await db
          .select({
            classGroupId: enrollment.classGroupId,
            studentId: enrollment.studentId,
            status: enrollment.status,
            startedOn: enrollment.startedOn,
          })
          .from(enrollment)
          .where(inArray(enrollment.classGroupId, groupIds))
      : [];
    const attendances = await db
      .select()
      .from(lessonAttendance)
      .where(inArray(lessonAttendance.lessonId, due.map((d) => d.lesson.id)));

    for (const { lesson: l, kinds } of due) {
      const studentIds = reminderRecipients(
        l,
        enrollments,
        attendances.filter((a) => a.lessonId === l.id),
      );
      const recipients = await loadRecipients(db, studentIds);
      const link = lessonPagePath(l.id);
      for (const studentId of studentIds) {
        const recipient = recipients.get(studentId);
        if (!recipient) continue;
        for (const kind of kinds) {
          const template: NotificationTemplate = { key: REMINDER_TEMPLATE[kind], at: l.startsAt };
          const id = await notifyWith(deps, {
            userId: studentId,
            type: kind,
            template,
            link,
            sendEmail: true,
            dedupeKey: reminderDedupeKey(kind, l.id, studentId),
          });
          if (!id) continue;
          result.notifications++;
          const text = renderWhatsAppText(
            {
              ...template,
              params: { name: recipient.name.split(" ")[0] ?? "", url: new URL(link, deps.appUrl).toString() },
            },
            recipient.locale,
          );
          if (text) {
            const queued = await queueWhatsAppWith(deps, {
              recipientId: studentId,
              phoneNumber: recipient.phoneNumber,
              body: text,
              sourceType: kind,
              sourceId: l.id,
              expiresAt: l.startsAt,
            });
            if (queued) result.whatsapp++;
          }
        }
      }
    }
  }

  result.emailRetries = await retryFailedEmails(deps, now);
  return result;
}

export type AnnouncementAudience =
  /** Active students by default; former students and trial users only when asked (V10). */
  | { all: true; includeFormer?: boolean; includeTrials?: boolean }
  | { classGroupIds: string[] }
  | { userIds: string[] };

export class AnnouncementError extends Error {
  constructor(readonly code: "empty" | "tooLong" | "noRecipients" | "meetingLink") {
    super(`Invalid announcement: ${code}`);
    this.name = "AnnouncementError";
  }
}

/** Validates the text written by the teacher. Returns the trimmed text. */
export function validateAnnouncementBody(body: string): string {
  const text = body.trim();
  if (!text) throw new AnnouncementError("empty");
  if (text.length > ANNOUNCEMENT_MAX_LENGTH) throw new AnnouncementError("tooLong");
  if (containsMeetingLink(text)) throw new AnnouncementError("meetingLink");
  return text;
}

/**
 * Students an announcement reaches. "Everyone" means students with an active
 * enrollment (V10); blocked and former students are left out unless
 * `includeFormer` is set, and trial users unless `includeTrials` is set.
 * Specific ids are restricted to students and trial users.
 */
export async function resolveAudience(db: Database, audience: AnnouncementAudience): Promise<string[]> {
  if ("all" in audience) {
    const active = await db
      .selectDistinct({ id: enrollment.studentId })
      .from(enrollment)
      .innerJoin(user, eq(user.id, enrollment.studentId))
      .where(and(eq(enrollment.status, "active"), eq(user.role, "student")));
    const ids = new Set(active.map((r) => r.id));
    if (audience.includeFormer) {
      const students = await db.select({ id: user.id }).from(user).where(eq(user.role, "student"));
      for (const s of students) ids.add(s.id);
    }
    if (audience.includeTrials) {
      const trials = await db.select({ id: user.id }).from(user).where(eq(user.role, "trial"));
      for (const s of trials) ids.add(s.id);
    }
    return [...ids];
  }
  if ("classGroupIds" in audience) {
    if (audience.classGroupIds.length === 0) return [];
    const rows = await db
      .selectDistinct({ id: enrollment.studentId })
      .from(enrollment)
      .innerJoin(user, eq(user.id, enrollment.studentId))
      .where(
        and(
          inArray(enrollment.classGroupId, audience.classGroupIds),
          ne(enrollment.status, "dropped"),
          inArray(user.role, ["student", "trial"]),
        ),
      );
    return rows.map((r) => r.id);
  }
  if (audience.userIds.length === 0) return [];
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, audience.userIds), inArray(user.role, ["student", "trial"])));
  return rows.map((r) => r.id);
}

/** Delivers an announcement to the center, e-mail and the WhatsApp queue (one draft per student). */
export async function sendAnnouncement(
  deps: NotificationDeps,
  input: { authorId: string; authorName: string; body: string; audience: AnnouncementAudience },
): Promise<{ announcementId: string; recipients: number; whatsapp: number }> {
  const message = validateAnnouncementBody(input.body);
  const studentIds = await resolveAudience(deps.db, input.audience);
  if (studentIds.length === 0) throw new AnnouncementError("noRecipients");

  const [row] = await deps.db
    .insert(announcement)
    .values({ authorId: input.authorId, body: message, audience: input.audience })
    .returning({ id: announcement.id });
  if (!row) throw new Error("Announcement not stored");

  const recipients = await loadRecipients(deps.db, studentIds);
  const author = input.authorName.split(" ")[0] ?? input.authorName;
  let whatsapp = 0;
  for (const studentId of studentIds) {
    const recipient = recipients.get(studentId);
    if (!recipient) continue;
    await notifyWith(deps, {
      userId: studentId,
      type: NOTIFICATION_TYPES.announcement,
      template: { key: "announcement", params: { author, message } },
      sendEmail: true,
      dedupeKey: `announcement:${row.id}:${studentId}`,
    });
    const text = renderWhatsAppText(
      { key: "announcement", params: { name: recipient.name.split(" ")[0] ?? "", message } },
      recipient.locale,
    );
    if (text) {
      const queued = await queueWhatsAppWith(deps, {
        recipientId: studentId,
        phoneNumber: recipient.phoneNumber,
        body: text,
        sourceType: NOTIFICATION_TYPES.announcement,
        sourceId: row.id,
      });
      if (queued) whatsapp++;
    }
  }
  return { announcementId: row.id, recipients: studentIds.length, whatsapp };
}
