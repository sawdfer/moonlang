"use server";

import { z } from "zod";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { listNotifications, markRead, type NotificationItem } from "./queries";

// Server Actions of the notification center (F-008). Every role uses them; a
// user only ever reads or updates their own notifications.

export async function getMyNotifications(): Promise<{ items: NotificationItem[]; unread: number }> {
  const user = await requireUser();
  return listNotifications(db, user.id);
}

const markReadInput = z.union([z.literal("all"), z.array(z.string().min(1).max(64)).max(100)]);

export async function markNotificationsRead(ids: string[] | "all"): Promise<void> {
  const user = await requireUser();
  const parsed = markReadInput.parse(ids);
  await markRead(db, user.id, parsed, new Date());
}
