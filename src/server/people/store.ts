import "server-only";
// Data access for invites and consents (F-001). Takes the database as a parameter
// so tests can use `createTestDb()`.
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import { consent, invite } from "@/db/schema";

export type InviteRow = typeof invite.$inferSelect;

export async function insertInvite(
  db: Database,
  values: typeof invite.$inferInsert,
): Promise<InviteRow> {
  const [row] = await db.insert(invite).values(values).returning();
  return row;
}

export async function findInviteByTokenHash(
  db: Database,
  tokenHash: string,
): Promise<InviteRow | null> {
  const [row] = await db.select().from(invite).where(eq(invite.tokenHash, tokenHash));
  return row ?? null;
}

/**
 * Marks a valid invite as used in one statement, so two people opening the
 * same link at once cannot both create an account (RN-020: single use).
 */
export async function claimInvite(db: Database, id: string, now: Date): Promise<boolean> {
  const rows = await db
    .update(invite)
    .set({ usedAt: now })
    .where(and(eq(invite.id, id), isNull(invite.usedAt), gt(invite.expiresAt, now)))
    .returning({ id: invite.id });
  return rows.length === 1;
}

/** Gives the invite back when the account could not be created after claiming it. */
export async function releaseInvite(db: Database, id: string): Promise<void> {
  await db
    .update(invite)
    .set({ usedAt: null })
    .where(and(eq(invite.id, id), isNull(invite.usedByUserId)));
}

export async function setInviteUser(db: Database, id: string, userId: string): Promise<void> {
  await db.update(invite).set({ usedByUserId: userId }).where(eq(invite.id, id));
}

export async function listRecentInvites(db: Database, limit = 30): Promise<InviteRow[]> {
  return db.select().from(invite).orderBy(desc(invite.createdAt)).limit(limit);
}

/** Latest accepted version of the terms (RN-023), or null if the user never accepted. */
export async function latestConsentVersion(db: Database, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ version: consent.documentVersion })
    .from(consent)
    .where(eq(consent.userId, userId))
    .orderBy(desc(consent.acceptedAt))
    .limit(1);
  return row?.version ?? null;
}

export async function recordConsent(
  db: Database,
  userId: string,
  version: string,
  acceptedAt: Date,
): Promise<void> {
  await db.insert(consent).values({ userId, documentVersion: version, acceptedAt });
}
