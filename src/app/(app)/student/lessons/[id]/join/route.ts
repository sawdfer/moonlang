import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireUser } from "@/server/auth/session";
import { joinLesson } from "@/server/classes/student";

/**
 * "Entrar na aula" (V1): records the student's attendance, then sends them to
 * the meeting. The link is only revealed here, to the signed-in participant
 * (RN-015, RN-024). A plain link (no prefetch) is used, so only a tap gets here.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser(["student", "trial"]);
  const { id } = await params;
  const back = new URL(`/student/lessons/${encodeURIComponent(id)}`, request.url);

  // A link on another site must not record attendance for the signed-in student.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return NextResponse.redirect(back, 303);

  const result = await joinLesson(db, {
    lessonId: id,
    viewer: { id: user.id, role: user.role as "student" | "trial" },
    now: new Date(),
  });
  if (!result.ok) {
    back.searchParams.set("join", result.reason);
    return NextResponse.redirect(back, 303);
  }
  const response = NextResponse.redirect(result.meetingUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
