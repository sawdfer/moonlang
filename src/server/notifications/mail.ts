import "server-only";
import { env } from "@/env";
import { createResendEmailSender, type EmailSender } from "./email";

/**
 * E-mail adapter for F-001 (invites, password reset), delivered through Resend
 * when `RESEND_API_KEY` and `EMAIL_FROM` are set. Without them, messages are
 * written to the console in development. In production nothing is logged,
 * because the body contains single-use links.
 */
export type MailInput = {
  to: string;
  subject: string;
  text: string;
};

let sender: EmailSender | undefined;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text as HTML paragraphs, with bare URLs turned into links. */
function toHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) =>
      escapeHtml(block)
        .replace(/https?:\/\/[^\s<]+/g, (url) => `<a href="${url}">${url}</a>`)
        .replace(/\n/g, "<br>"),
    )
    .map((block) => `<p style="margin:0 0 12px">${block}</p>`)
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f7f6fb;font-family:Inter,Arial,sans-serif;color:#14163a"><div style="max-width:520px;margin:0 auto;padding:32px 24px">${paragraphs}</div></body></html>`;
}

export async function sendMail(input: MailInput): Promise<void> {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    sender ??= createResendEmailSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
    await sender.send({ ...input, html: toHtml(input.text) });
    return;
  }
  if (process.env.NODE_ENV === "production") {
    console.warn("[mail] RESEND_API_KEY/EMAIL_FROM not set; message not sent.");
    return;
  }
  console.info(`[mail] To: ${input.to}\n[mail] Subject: ${input.subject}\n${input.text}`);
}
