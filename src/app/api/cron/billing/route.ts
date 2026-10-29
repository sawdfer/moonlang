import { timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { runDailyBilling } from "@/server/billing";

function authorized(header: string | null): boolean {
  if (!env.CRON_SECRET || !header) return false;
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  const received = Buffer.from(header);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Daily billing job (F-007), called by the scheduler with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDailyBilling();
  return Response.json(result);
}
