import "server-only";

/**
 * Minimal e-mail adapter used by F-001 (invites, password reset).
 * No provider is configured yet (Resend comes with F-008), so messages are
 * written to the console in development. In production nothing is logged,
 * because the body may contain single-use links.
 * TODO(F-008): deliver through Resend.
 */
export type MailInput = {
  to: string;
  subject: string;
  text: string;
};

export async function sendMail(input: MailInput): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.warn("[mail] No e-mail provider configured; message not sent.");
    return;
  }
  console.info(`[mail] To: ${input.to}\n[mail] Subject: ${input.subject}\n${input.text}`);
}
