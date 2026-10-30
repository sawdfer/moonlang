import "server-only";
import { db } from "@/db";
import { env } from "@/env";
import { getEmailSender as sharedEmailSender } from "./sender";
import {
  type AnnouncementAudience,
  type NotificationDeps,
  type NotifyInput,
  notifyWith,
  type QueueWhatsAppInput,
  queueWhatsAppWith,
  runReminders as runRemindersWith,
  sendAnnouncement as sendAnnouncementWith,
} from "./service";

/**
 * Public API of the notifications domain (F-008). Other domains call these
 * functions instead of writing notification tables directly.
 *
 * - `notify()` stores the notification in the user's center and, with
 *   `sendEmail: true`, e-mails it in the user's language (respecting the
 *   "non-essential e-mails" preference). Pass `template` to get texts in the
 *   recipient's language; plain `title`/`body` still work.
 * - `queueWhatsApp()` adds a ready-made text to the teacher's WhatsApp queue
 *   (sent manually via wa.me). Numbers that are not valid mobiles are skipped.
 *
 * Nothing here may contain a meeting link (RN-024): links are platform paths
 * and texts with Google Meet or Zoom addresses are rejected.
 */
export type { NotifyInput, QueueWhatsAppInput, AnnouncementAudience };
export type { NotificationTemplate, TemplateKey } from "./templates";
export { NOTIFICATION_TYPES } from "./types";

let warned = false;

function getEmailSender() {
  const sender = sharedEmailSender();
  if (!warned && sender.name === "console" && env.NODE_ENV === "production") {
    warned = true;
    console.warn("[notifications] SMTP_HOST/EMAIL_FROM not set: e-mails are only logged.");
  }
  return sender;
}

function deps(): NotificationDeps {
  return {
    db,
    email: getEmailSender(),
    appUrl: env.BETTER_AUTH_URL,
    log: (message, error) => console.error(`[notifications] ${message}`, error),
  };
}

/** Returns the notification id, or null when `dedupeKey` was already used. */
export async function notify(input: NotifyInput): Promise<string | null> {
  return notifyWith(deps(), input);
}

/** Returns the queued message id, or null when the phone number is not a valid mobile. */
export async function queueWhatsApp(input: QueueWhatsAppInput): Promise<string | null> {
  return queueWhatsAppWith(deps(), input);
}

export async function runReminders(now: Date = new Date()) {
  return runRemindersWith(deps(), now);
}

export async function sendAnnouncement(input: Parameters<typeof sendAnnouncementWith>[1]) {
  return sendAnnouncementWith(deps(), input);
}
