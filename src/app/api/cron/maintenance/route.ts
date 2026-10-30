import { timingSafeEqual } from "node:crypto";
import { db } from "@/db";
import { env } from "@/env";
import { syncSchedule } from "@/server/classes/lessons";
import { runRetentionReview } from "@/server/people/retention";

function authorized(header: string | null): boolean {
  if (!env.CRON_SECRET || !header) return false;
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * Hourly housekeeping, so rules apply even when nobody opens a page:
 * weekly lessons, absences (F-004, V1) and expired credits (RN-011, V2) via
 * `syncSchedule`,
 * and the inactivity review (RN-021). Every step is idempotent.
 */
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const now = new Date();
  await syncSchedule(db, now);
  await runRetentionReview(now);
  return Response.json({ ok: true });
}
