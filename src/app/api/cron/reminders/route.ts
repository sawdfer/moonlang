import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { runReminders } from "@/server/notifications";

/**
 * Lesson reminders job (F-008). Call every 5–15 minutes with
 * `Authorization: Bearer <CRON_SECRET>`. Idempotent: running it twice sends nothing new.
 */
function authorized(request: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  // Compare digests so the comparison takes the same time whatever the input length.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runReminders(new Date());
  return Response.json(result);
}

export const POST = GET;
