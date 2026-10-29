// Notification types and which e-mails a user may turn off (F-008).

/** Types created by this domain or documented in the F-008 event table. `type` stays a free string for callers. */
export const NOTIFICATION_TYPES = {
  lessonTomorrow: "lesson_tomorrow",
  lessonInOneHour: "lesson_in_one_hour",
  announcement: "announcement",
  chargeDueSoon: "charge_due_soon",
  chargeOverdue: "charge_overdue",
  blockWarning: "block_warning",
  priceChange: "price_change",
  materialsAvailable: "materials_available",
  taskPending: "task_pending",
} as const;

/** Lesson and billing reminders can never be turned off (F-008, "Preferências"). */
const ALWAYS_EMAILED = new Set<string>([
  NOTIFICATION_TYPES.lessonTomorrow,
  NOTIFICATION_TYPES.lessonInOneHour,
  NOTIFICATION_TYPES.chargeDueSoon,
  NOTIFICATION_TYPES.chargeOverdue,
  NOTIFICATION_TYPES.blockWarning,
  NOTIFICATION_TYPES.priceChange,
]);

/** E-mails the user could turn off. Empty: every e-mail is essential (V9). */
const NON_ESSENTIAL = new Set<string>([]);

/**
 * Whether a notification e-mail goes out given the user's preference.
 * Unknown types count as essential: every MVP 1 event in F-008 is transactional,
 * and a missed lesson or billing notice is worse than an extra e-mail.
 */
export function shouldSendEmail(input: {
  type: string;
  essential?: boolean;
  nonEssentialEmails: boolean;
}): boolean {
  if (ALWAYS_EMAILED.has(input.type)) return true;
  const essential = input.essential ?? !NON_ESSENTIAL.has(input.type);
  return essential || input.nonEssentialEmails;
}
