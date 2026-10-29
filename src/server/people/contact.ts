import "server-only";
// Re-engagement of inactive students (F-002, metric "tentativas de reativação").
import { db } from "@/db";
import { contactAttempt } from "@/db/schema";
import { localeOf, peopleTranslator } from "@/server/auth/mail-text";
import { queueWhatsApp } from "@/server/notifications";
import { waMeUrl } from "@/server/notifications/whatsapp";
import { type Actor, loadVisibleStudent } from "./students";

/**
 * Records a contact attempt. For WhatsApp, a ready-made message goes to the
 * teacher's queue and the wa.me link is returned, to open it in one tap (F-008).
 */
export async function recordContactAttempt(
  actor: Actor,
  studentId: string,
  input: { channel: "whatsapp" | "email" | "phone_call"; outcome: string | null; note: string | null },
): Promise<{ whatsappUrl: string | null }> {
  const { user: student } = await loadVisibleStudent(actor, studentId);
  const [row] = await db
    .insert(contactAttempt)
    .values({ studentId, createdById: actor.id, ...input })
    .returning({ id: contactAttempt.id });

  if (input.channel !== "whatsapp" || !student.phoneNumber) return { whatsappUrl: null };
  const t = peopleTranslator(await localeOf(studentId));
  const body = t("reengagement", { name: student.name.split(" ")[0] ?? student.name });
  const queued = await queueWhatsApp({
    recipientId: studentId,
    phoneNumber: student.phoneNumber,
    body,
    sourceType: "reengagement",
    sourceId: row!.id,
  });
  return { whatsappUrl: queued ? waMeUrl(student.phoneNumber, body) : null };
}
