// E-mail delivery for notifications (F-008). Resend in production, console in development.
import type { Locale } from "@/i18n/config";
import { emailStrings, interpolate } from "./templates";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export interface EmailSender {
  readonly name: string;
  send(message: EmailMessage): Promise<void>;
}

/** Development fallback: prints the e-mail instead of sending it. */
export function createConsoleEmailSender(log: (line: string) => void = console.info): EmailSender {
  return {
    name: "console",
    async send(message) {
      log(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
    },
  };
}

/** Sends through the Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email). */
export function createResendEmailSender(options: {
  apiKey: string;
  from: string;
  fetch?: typeof fetch;
}): EmailSender {
  const doFetch = options.fetch ?? fetch;
  return {
    name: "resend",
    async send(message) {
      const response = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new Error(`Resend responded ${response.status}`);
      }
    },
  };
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Builds the e-mail for a notification. The only link is to a page inside the
 * platform, never to the meeting (RN-024).
 */
export function buildNotificationEmail(input: {
  to: string;
  recipientName: string;
  locale: Locale;
  title: string;
  body: string;
  link?: string | null;
  appUrl: string;
}): EmailMessage {
  const strings = emailStrings(input.locale);
  const greeting = interpolate(strings.greeting, { name: input.recipientName.split(" ")[0] ?? "" });
  const url = input.link ? new URL(input.link, input.appUrl).toString() : null;

  const text = [greeting, "", input.body, ...(url ? ["", `${strings.cta}: ${url}`] : []), "", "—", strings.footer].join(
    "\n",
  );

  const paragraphs = input.body
    .split(/\n+/)
    .map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`)
    .join("");
  const button = url
    ? `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#6d5ce8;color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(strings.cta)}</a></p>`
    : "";
  const html = `<!doctype html><html lang="${input.locale}"><body style="margin:0;background:#f7f6fb;font-family:Inter,Arial,sans-serif;color:#14163a"><div style="max-width:520px;margin:0 auto;padding:32px 24px"><h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(input.title)}</h1><p style="margin:0 0 12px">${escapeHtml(greeting)}</p>${paragraphs}${button}<p style="margin:32px 0 0;font-size:12px;color:#5b5d7a">${escapeHtml(strings.footer)}</p></div></body></html>`;

  return { to: input.to, subject: input.title, text, html };
}
