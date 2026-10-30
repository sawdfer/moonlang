import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/** Container health check (ADR-004): the server answers and the database responds. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("[health] database check failed:", error);
    return Response.json({ ok: false }, { status: 503 });
  }
}
