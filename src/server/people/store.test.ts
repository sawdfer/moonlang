import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "@/db/client";
import { user } from "@/db/schema";
import { createTestDb } from "@/test/db";
import { hashInviteToken, inviteExpiresAt } from "./rules";
import {
  claimInvite,
  findInviteByTokenHash,
  insertInvite,
  latestConsentVersion,
  recordConsent,
  releaseInvite,
  setInviteUser,
} from "./store";

let db: Database;
const now = new Date("2026-11-10T15:00:00Z");

beforeEach(async () => {
  db = await createTestDb();
  await db.insert(user).values({
    id: "teacher-1",
    name: "Luana",
    email: "luana@example.com",
    role: "teacher",
    createdAt: now,
    updatedAt: now,
  });
});

async function newInvite(token = "token-1") {
  return insertInvite(db, {
    tokenHash: hashInviteToken(token),
    kind: "student",
    name: "Ana",
    invitedById: "teacher-1",
    expiresAt: inviteExpiresAt(now),
  });
}

describe("invite store", () => {
  it("RN-020: finds an invite by the hash of its token", async () => {
    const created = await newInvite("abc");
    expect((await findInviteByTokenHash(db, hashInviteToken("abc")))?.id).toBe(created.id);
    expect(await findInviteByTokenHash(db, hashInviteToken("other"))).toBeNull();
  });

  it("RN-020: an invite can be claimed only once", async () => {
    const invite = await newInvite();
    const results = await Promise.all([claimInvite(db, invite.id, now), claimInvite(db, invite.id, now)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimInvite(db, invite.id, now)).toBe(false);
  });

  it("RN-020: an expired invite cannot be claimed", async () => {
    const invite = await newInvite();
    expect(await claimInvite(db, invite.id, inviteExpiresAt(now))).toBe(false);
  });

  it("gives the invite back when the account could not be created", async () => {
    const invite = await newInvite();
    await claimInvite(db, invite.id, now);
    await releaseInvite(db, invite.id);
    expect(await claimInvite(db, invite.id, now)).toBe(true);
  });

  it("never releases an invite that already created an account", async () => {
    const invite = await newInvite();
    await claimInvite(db, invite.id, now);
    await db.insert(user).values({
      id: "student-1",
      name: "Ana",
      email: "ana@example.com",
      role: "student",
      createdAt: now,
      updatedAt: now,
    });
    await setInviteUser(db, invite.id, "student-1");
    await releaseInvite(db, invite.id);
    expect(await claimInvite(db, invite.id, now)).toBe(false);
  });
});

describe("consent store", () => {
  it("RN-023: returns the latest accepted version", async () => {
    expect(await latestConsentVersion(db, "teacher-1")).toBeNull();
    await recordConsent(db, "teacher-1", "v1", new Date("2026-01-01T00:00:00Z"));
    await recordConsent(db, "teacher-1", "v2", new Date("2026-06-01T00:00:00Z"));
    expect(await latestConsentVersion(db, "teacher-1")).toBe("v2");
  });
});
