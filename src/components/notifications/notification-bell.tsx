import { db } from "@/db";
import { getCurrentUser } from "@/server/auth/session";
import { listNotifications } from "@/server/notifications/queries";
import { NotificationCenter } from "./notification-center";

/**
 * Notification center for any signed-in role (F-008). Place it in a header:
 * `<NotificationBell />`. Renders nothing for anonymous visitors.
 */
export async function NotificationBell() {
  const user = await getCurrentUser();
  if (!user) return null;
  const initial = await listNotifications(db, user.id);
  return <NotificationCenter initial={initial} />;
}
