import "server-only";
import { format } from "date-fns";
import { createTranslator } from "next-intl";
import { formatBRL } from "@/lib/money";
import { NOTIFICATION_TYPES, notify, queueWhatsApp, type TemplateKey } from "@/server/notifications";
import messages from "../../../messages/pt-BR/billing.json";
import { type Day, parseDay } from "./rules";

// WhatsApp drafts are sent by the teacher herself, so they stay in Portuguese.
const t = createTranslator({ locale: "pt-BR", messages, namespace: "billing.notifications" });

type Recipient = { id: string; name: string; phoneNumber: string | null };
type Notice = { chargeId: string; amountCents: number; dueDate: Day };

const STUDENT_FINANCE_PATH = "/student/finance";

/**
 * In-app notice and e-mail from the F-008 templates (in the student's
 * language), plus a WhatsApp draft. `dedupeKey` makes every notice go out once,
 * even when the daily job runs again.
 */
async function send(
  student: Recipient,
  input: { type: string; template: TemplateKey; dedupeKey: string; amountCents: number; date: Day; whatsApp?: string },
) {
  const id = await notify({
    userId: student.id,
    type: input.type,
    template: { key: input.template, params: { amount: formatBRL(input.amountCents) }, at: parseDay(input.date) },
    link: STUDENT_FINANCE_PATH,
    sendEmail: true,
    dedupeKey: input.dedupeKey,
  });
  if (id && input.whatsApp) {
    await queueWhatsApp({
      recipientId: student.id,
      phoneNumber: student.phoneNumber,
      body: input.whatsApp,
      sourceType: input.type,
      sourceId: input.dedupeKey,
    });
  }
}

function whatsAppValues(student: Recipient, amountCents: number, date: Day) {
  return {
    name: student.name.split(" ")[0] ?? student.name,
    amount: formatBRL(amountCents),
    date: format(parseDay(date), "dd/MM"),
  };
}

/** "Your monthly fee is due in 3 days" (F-007, V6). */
export function noticeDueSoon(student: Recipient, notice: Notice) {
  return send(student, {
    type: NOTIFICATION_TYPES.chargeDueSoon,
    template: "chargeDueSoon",
    dedupeKey: `charge_due_soon:${notice.chargeId}`,
    amountCents: notice.amountCents,
    date: notice.dueDate,
    whatsApp: t("dueSoonWhatsApp", whatsAppValues(student, notice.amountCents, notice.dueDate)),
  });
}

/** Sent once, when a charge becomes overdue (RN-015). */
export function noticeOverdue(student: Recipient, notice: Notice) {
  return send(student, {
    type: NOTIFICATION_TYPES.chargeOverdue,
    template: "chargeOverdue",
    dedupeKey: `charge_overdue:${notice.chargeId}`,
    amountCents: notice.amountCents,
    date: notice.dueDate,
    whatsApp: t("overdueWhatsApp", whatsAppValues(student, notice.amountCents, notice.dueDate)),
  });
}

/** "Before you are blocked", once per overdue charge (RN-015). `deadline` is the next due date. */
export function noticeBlockWarning(student: Recipient, notice: Notice & { deadline: Day }) {
  return send(student, {
    type: NOTIFICATION_TYPES.blockWarning,
    template: "blockWarning",
    dedupeKey: `block_warning:${notice.chargeId}`,
    amountCents: notice.amountCents,
    date: notice.deadline,
  });
}
