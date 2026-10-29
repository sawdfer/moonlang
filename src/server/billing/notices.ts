import "server-only";
import { format } from "date-fns";
import { createTranslator } from "next-intl";
import { formatBRL } from "@/lib/money";
import { notify, queueWhatsApp } from "@/server/notifications";
import messages from "../../../messages/pt-BR/billing.json";
import { type Day, parseDay } from "./rules";

// TODO(F-008): pick the student's locale once notification templates support it.
const t = createTranslator({ locale: "pt-BR", messages, namespace: "billing.notifications" });

type Recipient = { id: string; name: string; phoneNumber: string | null };
type Notice = { chargeId: string; amountCents: number; dueDate: Day };

const STUDENT_FINANCE_PATH = "/student/finance";

function values(student: Recipient, notice: Notice) {
  return {
    name: student.name.split(" ")[0] ?? student.name,
    amount: formatBRL(notice.amountCents),
    date: format(parseDay(notice.dueDate), "dd/MM"),
  };
}

/** "Your monthly fee is due in 3 days", sent when the charge is generated (F-007). */
export async function noticeDueSoon(student: Recipient, notice: Notice) {
  const v = values(student, notice);
  await notify({
    userId: student.id,
    type: "billing.due_soon",
    title: t("dueSoonTitle", v),
    body: t("dueSoonBody", v),
    link: STUDENT_FINANCE_PATH,
    sendEmail: true,
  });
  if (student.phoneNumber) {
    await queueWhatsApp({
      recipientId: student.id,
      phoneNumber: student.phoneNumber,
      body: t("dueSoonWhatsApp", v),
      sourceType: "charge.due_soon",
      sourceId: notice.chargeId,
    });
  }
}

/** Sent once, when a charge becomes overdue (RN-015). */
export async function noticeOverdue(student: Recipient, notice: Notice) {
  const v = values(student, notice);
  await notify({
    userId: student.id,
    type: "billing.overdue",
    title: t("overdueTitle", v),
    body: t("overdueBody", v),
    link: STUDENT_FINANCE_PATH,
    sendEmail: true,
  });
  if (student.phoneNumber) {
    await queueWhatsApp({
      recipientId: student.id,
      phoneNumber: student.phoneNumber,
      body: t("overdueWhatsApp", v),
      sourceType: "charge.overdue",
      sourceId: notice.chargeId,
    });
  }
}
