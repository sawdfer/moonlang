// Creates the root account, the initial plans and default settings.
// Idempotent: safe to run more than once. Usage: pnpm db:seed
// In production it runs on every deploy (migrate service, ADR-004); the root
// account is only created when SEED_ROOT_EMAIL and SEED_ROOT_PASSWORD are set.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { plan, setting, user } from "@/db/schema";
import { createUserWithPassword } from "@/server/auth/create-user";
import { DEFAULT_SETTINGS } from "@/server/settings/defaults";

async function main() {
  const email = process.env.SEED_ROOT_EMAIL;
  const password = process.env.SEED_ROOT_PASSWORD;
  if (!email || !password) {
    console.log("SEED_ROOT_EMAIL/SEED_ROOT_PASSWORD not set: root account skipped.");
  } else {
    const [existing] = await db.select().from(user).where(eq(user.email, email.toLowerCase()));
    if (existing) {
      console.log("Root account already exists.");
    } else {
      await createUserWithPassword({ name: "Root", email, password, role: "root" });
      console.log("Root account created.");
    }
  }

  // Initial plans (RN-013).
  const plans = await db.select().from(plan);
  if (plans.length === 0) {
    await db.insert(plan).values([
      { name: "1h", durationMinutes: 60, priceCents: 16900 },
      { name: "2h", durationMinutes: 120, priceCents: 24900 },
    ]);
    console.log("Plans created.");
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    // Unset values (e.g. the Pix key) are configured later by the admin.
    if (value === null) continue;
    await db.insert(setting).values({ key, value }).onConflictDoNothing();
  }
  console.log("Settings ensured.");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
