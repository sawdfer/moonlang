import "server-only";
import nodemailer from "nodemailer";
import { env } from "@/env";
import { createConsoleEmailSender, createSmtpEmailSender, type EmailSender } from "./email";

let sender: EmailSender | undefined;

/**
 * The platform's e-mail sender: SMTP when SMTP_HOST and EMAIL_FROM are set
 * (ADR-004), otherwise the console. Shared by notifications and auth e-mails.
 */
export function getEmailSender(): EmailSender {
  if (!sender) {
    sender =
      env.SMTP_HOST && env.EMAIL_FROM
        ? createSmtpEmailSender({
            transport: nodemailer.createTransport({
              host: env.SMTP_HOST,
              port: env.SMTP_PORT,
              secure: env.SMTP_SECURE === "true",
              // Port 587 must upgrade to TLS: never send credentials in clear text.
              requireTLS: env.SMTP_SECURE !== "true",
              ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
              connectionTimeout: 10_000,
              socketTimeout: 20_000,
            }),
            from: env.EMAIL_FROM,
            replyTo: env.EMAIL_REPLY_TO,
          })
        : createConsoleEmailSender();
  }
  return sender;
}
