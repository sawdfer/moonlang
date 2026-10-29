import "server-only";
// Invites and invite acceptance (F-001, RN-019, RN-020, RN-023).
import { eq, or } from "drizzle-orm";
import { db } from "@/db";
import { studentProfile, user } from "@/db/schema";
import { env } from "@/env";
import { toDateString } from "@/lib/dates";
import { recordAudit } from "@/server/audit";
import { createUserWithPassword } from "@/server/auth/create-user";
import { mailTranslator } from "@/server/auth/mail-text";
import type { CurrentUser } from "@/server/auth/session";
import { notify, queueWhatsApp } from "@/server/notifications";
import { sendMail } from "@/server/notifications/mail";
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteStatus,
  type InviteStatus,
  isAdult,
} from "./rules";
import {
  claimInvite,
  findInviteByTokenHash,
  insertInvite,
  type InviteRow,
  recordConsent,
  releaseInvite,
  setInviteUser,
} from "./store";
import { TERMS_VERSION } from "./terms";

export function inviteUrl(token: string): string {
  return new URL(`/invite/${token}`, env.BETTER_AUTH_URL).toString();
}

/** wa.me link with the message ready to send in one tap (no WhatsApp API in the MVP). */
export function whatsAppUrl(phoneNumber: string, body: string): string {
  return `https://wa.me/${phoneNumber.replace(/\D/g, "")}?text=${encodeURIComponent(body)}`;
}

/**
 * Creates a 7-day single-use invite (RN-020). The plain token is returned only
 * here, to be shown once; the database keeps its hash.
 */
export async function createInvite(
  actor: CurrentUser,
  input: { kind: "student" | "trial"; name: string; email: string | null; phoneNumber: string | null },
  now = new Date(),
) {
  const token = generateInviteToken();
  const row = await insertInvite(db, {
    tokenHash: hashInviteToken(token),
    kind: input.kind,
    name: input.name,
    email: input.email,
    phoneNumber: input.phoneNumber,
    invitedById: actor.id,
    expiresAt: inviteExpiresAt(now),
  });
  const url = inviteUrl(token);
  const t = mailTranslator();
  const message = t("inviteBody", { name: input.name, teacher: actor.name, url });

  if (input.email) {
    await sendMail({ to: input.email, subject: t("inviteSubject"), text: message });
  }
  let whatsapp: string | null = null;
  if (input.phoneNumber) {
    // The draft holds the link, so it expires together with the invite.
    await queueWhatsApp({
      phoneNumber: input.phoneNumber,
      body: message,
      sourceType: "invite",
      sourceId: row.id,
      expiresAt: row.expiresAt,
    });
    whatsapp = whatsAppUrl(input.phoneNumber, message);
  }
  await recordAudit({
    actorId: actor.id,
    action: "invite.create",
    entityType: "invite",
    entityId: row.id,
    data: { kind: input.kind },
  });
  return { url, whatsapp, expiresAt: row.expiresAt };
}

export type InviteLookup =
  | { status: "valid"; invite: InviteRow }
  | { status: Exclude<InviteStatus, "valid"> | "not_found" };

export async function findInvite(token: string, now = new Date()): Promise<InviteLookup> {
  const row = await findInviteByTokenHash(db, hashInviteToken(token));
  if (!row) return { status: "not_found" };
  const status = inviteStatus(row, now);
  return status === "valid" ? { status, invite: row } : { status };
}

export type AcceptInviteInput = {
  name: string;
  email: string;
  phoneNumber: string;
  birthDate: string;
  password: string;
  goal: string | null;
};

export type AcceptInviteResult =
  | { ok: true; email: string; role: "student" | "trial" }
  | { ok: false; error: "invalidInvite" | "underage" | "taken" };

/**
 * Creates the account from an invite. The caller has already validated the
 * input (including the mandatory terms acceptance) and the password policy.
 */
export async function acceptInvite(
  token: string,
  input: AcceptInviteInput,
  now = new Date(),
): Promise<AcceptInviteResult> {
  const found = await findInvite(token, now);
  if (found.status !== "valid") return { ok: false, error: "invalidInvite" };
  const { invite } = found;

  // RN-019: age is computed on the São Paulo calendar date.
  if (!isAdult(input.birthDate, toDateString(now))) return { ok: false, error: "underage" };

  // Generic message: never reveal anything about the other account (F-001).
  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(or(eq(user.email, input.email), eq(user.phoneNumber, input.phoneNumber)));
  if (existing) return { ok: false, error: "taken" };

  if (!(await claimInvite(db, invite.id, now))) return { ok: false, error: "invalidInvite" };

  let userId: string;
  try {
    const created = await createUserWithPassword({
      name: input.name,
      email: input.email,
      password: input.password,
      role: invite.kind,
      phoneNumber: input.phoneNumber,
    });
    userId = created.id;
  } catch (error) {
    await releaseInvite(db, invite.id);
    // A concurrent sign-up with the same e-mail or phone hits the unique constraint.
    if (isUniqueViolation(error)) return { ok: false, error: "taken" };
    throw error;
  }

  await setInviteUser(db, invite.id, userId);
  await db.insert(studentProfile).values({
    userId,
    birthDate: input.birthDate,
    goal: input.goal,
  });
  // RN-023: the accepted version is stored with the account.
  await recordConsent(db, userId, TERMS_VERSION, now);

  const t = mailTranslator();
  await notify({
    userId: invite.invitedById,
    type: "invite_accepted",
    title: t("inviteAcceptedTitle"),
    body: t("inviteAcceptedBody", { name: input.name }),
  });

  return { ok: true, email: input.email, role: invite.kind };
}

function isUniqueViolation(error: unknown): boolean {
  for (let e: unknown = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === "23505") return true;
  }
  return false;
}
