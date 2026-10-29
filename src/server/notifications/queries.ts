// Reads and updates for the notification center, the WhatsApp queue and the
// announcements page (F-008). Callers authorize first; every user-scoped
// function filters by the given user id.
import { and, count, desc, eq, gt, inArray, isNull, like, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { announcement, classGroup, enrollment, notification, user, whatsappMessage } from "@/db/schema";
import { toDateString } from "@/lib/dates";

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export async function listNotifications(
  db: Database,
  userId: string,
  limit = 20,
): Promise<{ items: NotificationItem[]; unread: number }> {
  const [rows, [unread]] = await Promise.all([
    db
      .select()
      .from(notification)
      .where(eq(notification.userId, userId))
      .orderBy(desc(notification.createdAt))
      .limit(limit),
    db
      .select({ value: count() })
      .from(notification)
      .where(and(eq(notification.userId, userId), isNull(notification.readAt))),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      link: r.link,
      read: r.readAt !== null,
      createdAt: r.createdAt.toISOString(),
    })),
    unread: unread?.value ?? 0,
  };
}

export async function unreadCount(db: Database, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return row?.value ?? 0;
}

/** Marks the user's own notifications as read; ids of other users are ignored. */
export async function markRead(db: Database, userId: string, ids: string[] | "all", now: Date) {
  const own = and(eq(notification.userId, userId), isNull(notification.readAt));
  await db
    .update(notification)
    .set({ readAt: now })
    .where(ids === "all" ? own : and(own, inArray(notification.id, ids)));
}

export type WhatsAppQueueItem = {
  id: string;
  recipientName: string | null;
  phoneNumber: string;
  body: string;
  sourceType: string;
  createdAt: Date;
  expiresAt: Date | null;
};

/** Pending messages, oldest first. Expired reminders are left out (F-008). */
export async function listWhatsAppQueue(db: Database, now: Date): Promise<WhatsAppQueueItem[]> {
  return db
    .select({
      id: whatsappMessage.id,
      recipientName: user.name,
      phoneNumber: whatsappMessage.phoneNumber,
      body: whatsappMessage.body,
      sourceType: whatsappMessage.sourceType,
      createdAt: whatsappMessage.createdAt,
      expiresAt: whatsappMessage.expiresAt,
    })
    .from(whatsappMessage)
    .leftJoin(user, eq(user.id, whatsappMessage.recipientId))
    .where(
      and(
        eq(whatsappMessage.status, "pending"),
        or(isNull(whatsappMessage.expiresAt), gt(whatsappMessage.expiresAt, now)),
      ),
    )
    .orderBy(whatsappMessage.createdAt);
}

export async function setWhatsAppStatus(
  db: Database,
  input: { id: string; status: "sent" | "discarded"; staffId: string; now: Date },
): Promise<boolean> {
  const rows = await db
    .update(whatsappMessage)
    .set({
      status: input.status,
      sentAt: input.status === "sent" ? input.now : null,
      sentById: input.staffId,
    })
    .where(and(eq(whatsappMessage.id, input.id), eq(whatsappMessage.status, "pending")))
    .returning({ id: whatsappMessage.id });
  return rows.length > 0;
}

/** Class groups and students the teacher can address on the announcements page. */
export async function announcementOptions(db: Database, now: Date) {
  const today = toDateString(now);
  const [groups, students] = await Promise.all([
    db
      .select({ id: classGroup.id, name: classGroup.name, endsOn: classGroup.endsOn })
      .from(classGroup)
      .orderBy(classGroup.name),
    db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.role, ["student", "trial"]))
      .orderBy(user.name),
  ]);
  const activeGroupIds = new Set(
    (
      await db
        .selectDistinct({ id: enrollment.classGroupId })
        .from(enrollment)
        .where(ne(enrollment.status, "dropped"))
    ).map((r) => r.id),
  );
  return {
    classGroups: groups
      .filter((g) => (g.endsOn === null || g.endsOn >= today) && activeGroupIds.has(g.id))
      .map(({ id, name }) => ({ id, name })),
    students,
  };
}

export async function recentAnnouncements(db: Database, limit = 10) {
  return db
    .select({
      id: announcement.id,
      body: announcement.body,
      createdAt: announcement.createdAt,
      authorName: user.name,
      recipients: count(notification.id),
    })
    .from(announcement)
    .leftJoin(user, eq(user.id, announcement.authorId))
    .leftJoin(
      notification,
      // Announcement notifications carry the key "announcement:<id>:<userId>".
      and(
        eq(notification.type, "announcement"),
        like(notification.dedupeKey, sql`'announcement:' || ${announcement.id} || ':%'`),
      ),
    )
    .groupBy(announcement.id, user.name)
    .orderBy(desc(announcement.createdAt))
    .limit(limit);
}
