import "server-only";
import { db } from "@/db";
import { notification, whatsappMessage } from "@/db/schema";

/**
 * Public API of the notifications domain (F-008). Other domains call these
 * functions instead of writing notification tables directly.
 *
 * Current version: stores in-app notifications and WhatsApp drafts.
 * TODO(F-008): e-mail delivery, preferences, templates per locale and CEFR level.
 */
export type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body: string;
  /** Path inside the platform, e.g. "/student/lessons/123". Never a meeting URL (RN-024). */
  link?: string;
  sendEmail?: boolean;
};

export async function notify(input: NotifyInput): Promise<void> {
  await db.insert(notification).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link,
    emailStatus: input.sendEmail ? "pending" : "none",
  });
}

/** Adds a ready-made message to the teacher's WhatsApp queue (sent manually via wa.me). */
export async function queueWhatsApp(input: {
  recipientId?: string;
  phoneNumber: string;
  body: string;
  sourceType: string;
  sourceId?: string;
  expiresAt?: Date;
}): Promise<void> {
  await db.insert(whatsappMessage).values(input);
}
